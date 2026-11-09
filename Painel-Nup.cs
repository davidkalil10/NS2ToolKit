namespace NS2Panel {
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Drawing;
    using System.IO;
    using System.Web.Script.Serialization;
    using System.Windows.Forms;

    public sealed class NupProgress {
        public string Message, Result;
        public bool Failed, Complete;
        public int Packed, Total;
        public void Accept(string line) {
            if (!line.StartsWith("PANEL:")) return;
            try {
                var value = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(line.Substring(6));
                string kind = Convert.ToString(value["kind"]);
                if (kind == "status") { Message = Convert.ToString(value["message"]); Total = 0; }
                else if (kind == "activity") { Message = Convert.ToString(value["message"]); }
                else if (kind == "pack") { Packed = Convert.ToInt32(value["done"]); Total = Convert.ToInt32(value["total"]); Message = "Compactando arquivos: " + Packed + " / " + Total; }
                else if (kind == "complete") { Result = Convert.ToString(value["path"]); Complete = !String.IsNullOrEmpty(Result); }
                else if (kind == "error") { Failed = true; Message = Convert.ToString(value["message"]); }
            } catch (Exception error) { Failed = true; Message = "Resposta inválida do gerador: " + error.Message; }
        }
        public bool Successful(int exitCode, bool cancelled) { return exitCode == 0 && Complete && !Failed && !cancelled; }
    }

    public sealed class NupWindow : Form {
        private readonly string root;
        private readonly TextBox source = new TextBox(), destination = new TextBox(), name = new TextBox(), output = new TextBox();
        private readonly Button begin = new Button(), cancel = new Button(), open = new Button();
        private readonly Label status = new Label();
        private readonly ProgressBar bar = new ProgressBar();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private readonly System.Collections.Generic.List<Control> inputs = new System.Collections.Generic.List<Control>();
        private Runner worker;
        private NupProgress progress;
        private bool cancelling;
        private DateTime started;
        private string resultFolder;

        public NupWindow(string folder) {
            root = folder; Text = "NS2 • Gerar NUP"; ClientSize = new Size(865, 625);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterParent; Font = new Font("Segoe UI", 10);
            BackColor = Color.FromArgb(245, 247, 251);
            LabelAt("Gerar NUP a partir de um backup", 18, 18, 820, 35, true);
            LabelAt("Escolha a pasta do jogo: backup do assistente ou pasta copiada pelo FTP.", 22, 62, 820, 25, false);
            Field("Pasta de origem", source, 100, Path.Combine(root, "backups"));
            Field("Salvar NUP em", destination, 174, Path.Combine(root, "exports", "nup"));
            LabelAt("Nome do jogo (opcional; preencha para backups antigos sem nome)", 22, 248, 820, 24, false);
            name.SetBounds(22, 276, 820, 28); Controls.Add(name); inputs.Add(name);
            begin.Text = "Gerar e verificar"; begin.SetBounds(22, 324, 165, 35); begin.Click += delegate { StartBuild(); }; Controls.Add(begin);
            cancel.Text = "Cancelar"; cancel.SetBounds(197, 324, 140, 35); cancel.Enabled = false; cancel.Click += delegate { CancelBuild(); }; Controls.Add(cancel);
            open.Text = "Abrir pasta"; open.SetBounds(347, 324, 140, 35); open.Click += delegate {
                try {
                    string path = resultFolder ?? Path.GetFullPath(destination.Text);
                    Directory.CreateDirectory(path);
                    Process.Start(new ProcessStartInfo("explorer.exe", Checks.QuoteArgument(path)) { UseShellExecute = true });
                } catch (Exception error) { MessageBox.Show(this, error.Message); }
            }; Controls.Add(open);
            status.Text = "Não precisa iniciar conexão com o console. Saídas anteriores são preservadas.";
            status.SetBounds(22, 378, 820, 47); Controls.Add(status);
            bar.SetBounds(22, 431, 820, 12); bar.Maximum = 1000; Controls.Add(bar);
            output.SetBounds(22, 462, 820, 139); output.Multiline = true; output.ReadOnly = true;
            output.ScrollBars = ScrollBars.Both; output.WordWrap = false; output.Font = new Font("Consolas", 9); Controls.Add(output);
            timer.Interval = 200; timer.Tick += Poll; timer.Start();
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (worker != null) { args.Cancel = true; CancelBuild(); return; }
                timer.Stop();
            };
        }
        private void LabelAt(string text, int x, int y, int width, int height, bool title) {
            Controls.Add(new Label { Text = text, Location = new Point(x, y), Size = new Size(width, height), Font = new Font("Segoe UI", title ? 18 : 10, title ? FontStyle.Bold : FontStyle.Regular) });
        }
        private void Field(string label, TextBox field, int y, string initial) {
            LabelAt(label, 22, y, 820, 24, false);
            field.Text = initial; field.SetBounds(22, y + 28, 653, 28); Controls.Add(field); inputs.Add(field);
            var browse = new Button { Text = "Escolher pasta", Location = new Point(685, y + 26), Size = new Size(157, 32) };
            browse.Click += delegate { using (var picker = new FolderBrowserDialog()) {
                picker.Description = label;
                if (Directory.Exists(field.Text)) picker.SelectedPath = field.Text;
                if (picker.ShowDialog(this) == DialogResult.OK) field.Text = picker.SelectedPath;
            } }; Controls.Add(browse); inputs.Add(browse);
        }
        private void StartBuild() {
            Runner next = null;
            try {
                string backup = Path.GetFullPath(source.Text), target = Path.GetFullPath(destination.Text);
                if (!Directory.Exists(backup)) throw new Exception("Escolha a pasta de origem do jogo.");
                string python = Checks.FindPython(root);
                next = new Runner(); next.SetEnvironment("PYTHONUTF8", "1");
                string arguments = Checks.QuoteArgument(backup) + " --out " + Checks.QuoteArgument(target) + " --panel";
                if (!String.IsNullOrWhiteSpace(name.Text)) arguments += " --name " + Checks.QuoteArgument(name.Text.Trim());
                next.Start(python, Path.Combine(root, "painel-nup.py"), arguments, root);
                worker = next; progress = new NupProgress(); cancelling = false; resultFolder = null; started = DateTime.UtcNow;
                foreach (var input in inputs) input.Enabled = false;
                begin.Enabled = false; cancel.Enabled = true; open.Enabled = false;
                output.Clear(); bar.Value = 0; bar.Style = ProgressBarStyle.Marquee; status.Text = "Conferindo a pasta de origem...";
            } catch (Exception error) { if (next != null) next.Dispose(); MessageBox.Show(this, error.Message, "Gerar NUP"); }
        }
        private void CancelBuild() {
            if (worker == null || cancelling) return;
            cancelling = true; cancel.Enabled = false;
            if (worker.Alive) worker.RequestCleanup();
            status.Text = "Cancelamento solicitado. Aguardando terminar a operação atual e limpar temporários...";
        }
        private void ReadOutput() {
            foreach (string line in worker.Drain()) { output.AppendText(line + Environment.NewLine); progress.Accept(line); }
        }
        private void Poll(object sender, EventArgs args) {
            if (worker == null) return;
            ReadOutput();
            if (!cancelling && progress.Message != null) status.Text = progress.Message + " • " + (int)(DateTime.UtcNow - started).TotalSeconds + "s";
            if (progress.Total > 0) { bar.Style = ProgressBarStyle.Continuous; bar.Value = (int)Math.Min(1000, 1000.0 * progress.Packed / progress.Total); }
            else bar.Style = ProgressBarStyle.Marquee;
            if (!worker.Complete) return;
            // Readers are finished: consume any final events queued after the first drain.
            ReadOutput();
            bool success = progress.Successful(worker.ExitCode, cancelling);
            bar.Style = ProgressBarStyle.Continuous; bar.Value = success ? 1000 : 0;
            if (success) {
                resultFolder = Path.GetDirectoryName(progress.Result);
                status.Text = "NUP concluído • conteúdo verificado. Clique em Abrir pasta.";
            } else status.Text = cancelling ? "Geração cancelada. O backup original foi preservado." : "Falha na geração. Confira o registro abaixo; o backup original foi preservado.";
            try {
                string logs = Path.Combine(root, "exports", "logs"); Directory.CreateDirectory(logs);
                File.WriteAllText(Path.Combine(logs, "nup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".log"), worker.Transcript);
            } catch (Exception error) { output.AppendText("Não foi possível salvar o registro: " + error.Message); }
            worker.Dispose(); worker = null;
            foreach (var input in inputs) input.Enabled = true;
            begin.Enabled = open.Enabled = true; cancel.Enabled = false;
        }
    }
}
