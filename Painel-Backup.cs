
namespace NS2Panel {
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Drawing;
    using System.IO;
    using System.Net;
    using System.Net.Sockets;
    using System.Web.Script.Serialization;
    using System.Windows.Forms;

    public sealed class GameChoice {
        public string Title, Name;
        public override string ToString() { return Name + " [" + Title.ToUpperInvariant() + "]"; }
    }

    public sealed class BackupWindow : Form {
        private readonly string root, session;
        private readonly TextBox host = new TextBox(), destination = new TextBox(), output = new TextBox();
        private readonly ComboBox games = new ComboBox();
        private readonly Button list = new Button(), begin = new Button(), cancel = new Button(), open = new Button();
        private readonly Label status = new Label();
        private readonly ProgressBar bar = new ProgressBar();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private Runner worker;
        private bool complete, failed, cancelling, listing, listed;
        private string backupFolder;
        public bool RequiresRestart { get; private set; }
        public BackupWindow(string folder, string run) {
            root = folder; session = run;
            Text = "NS2 • Backup dos seus jogos"; ClientSize = new Size(865, 610);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterParent; Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(245, 247, 251);
            AddLabel("Backup dos seus jogos", 20, 15, 800, 35, 18, true);
            AddLabel("Exporta os arquivos do jogo em .tar com OunceCake. Não inclui saves ou chaves.", 22, 58, 820, 25, 10, false);
            AddLabel("IP do Switch 2 (veja em Configurações → Internet)", 22, 96, 520, 24, 10, false);
            host.SetBounds(22, 123, 240, 28); Controls.Add(host);
            list.Text = "Listar jogos"; list.SetBounds(275, 121, 155, 32); list.Click += delegate { StartTask(true); }; Controls.Add(list);
            AddLabel("Jogo para copiar", 22, 169, 300, 24, 10, true);
            games.SetBounds(22, 197, 820, 30); games.DropDownStyle = ComboBoxStyle.DropDownList; Controls.Add(games);
            AddLabel("Salvar no PC", 22, 243, 300, 24, 10, true);
            destination.Text = Path.Combine(root, "backups"); destination.SetBounds(22, 270, 653, 28); Controls.Add(destination);
            var browse = new Button { Text = "Escolher pasta", Location = new Point(685, 268), Size = new Size(157, 32) };
            browse.Click += delegate { using (var picker = new FolderBrowserDialog()) { picker.Description = "Pasta para os backups dos jogos"; if (picker.ShowDialog(this) == DialogResult.OK) destination.Text = picker.SelectedPath; } }; Controls.Add(browse);
            begin.Text = "Fazer backup"; begin.SetBounds(22, 317, 155, 35); begin.Enabled = false; begin.Click += delegate { StartTask(false); }; Controls.Add(begin);
            cancel.Text = "Cancelar operação"; cancel.SetBounds(187, 317, 176, 35); cancel.Enabled = false; cancel.Click += delegate { CancelTask(); }; Controls.Add(cancel);
            open.Text = "Abrir pasta"; open.SetBounds(373, 317, 140, 35); open.Click += delegate { OpenFolder(); }; Controls.Add(open);
            status.Text = "Informe o IP do Switch e clique em Listar jogos."; status.SetBounds(22, 366, 820, 40); Controls.Add(status);
            bar.SetBounds(22, 410, 820, 12); bar.Maximum = 1000; Controls.Add(bar);
            output.SetBounds(22, 436, 820, 151); output.Multiline = true; output.ReadOnly = true; output.ScrollBars = ScrollBars.Both; output.WordWrap = false;
            output.Font = new Font("Consolas", 9); Controls.Add(output);
            games.SelectedIndexChanged += delegate { begin.Enabled = worker == null && games.SelectedItem != null; };
            timer.Interval = 200; timer.Tick += Poll; timer.Start();
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (worker != null && worker.Alive) {
                    args.Cancel = true;
                    if (!cancelling) CancelTask();
                    return;
                }
                timer.Stop();
            };
        }
        private void AddLabel(string text, int x, int y, int width, int height, int size, bool bold) {
            Controls.Add(new Label { Text = text, Location = new Point(x, y), Size = new Size(width, height), Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular) });
        }
        private static string FindPython() {
            foreach (string name in new[] {"python.exe", "py.exe"})
                foreach (string entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) {
                    string candidate;
                    try {candidate = Path.Combine(entry.Trim('"'), name);} catch {continue;}
                    if (!File.Exists(candidate)) continue;
                    try {
                        using (var process = Process.Start(new ProcessStartInfo(candidate, "-c \"import sys; assert sys.version_info >= (3,9); print('NS2-PYTHON-OK')\"") {
                            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true })) {
                            if (process.WaitForExit(4000) && process.ExitCode == 0 && process.StandardOutput.ReadToEnd().Contains("NS2-PYTHON-OK")) return candidate;
                            if (!process.HasExited) process.Kill();
                        }
                    } catch { }
                }
            throw new Exception("O backup precisa de Python 3.9 ou superior instalado no PC. A conexão ns2jb não foi alterada.");
        }
        private void StartTask(bool onlyList) {
            IPAddress address;
            if (!IPAddress.TryParse(host.Text.Trim(), out address) || address.AddressFamily != AddressFamily.InterNetwork) { MessageBox.Show(this, "Informe o endereço IPv4 do Switch, por exemplo 192.168.18.50. Ele é diferente do IP do PC."); return; }
            var game = games.SelectedItem as GameChoice;
            if (!onlyList && game == null) return;
            try {
                string node = Checks.FindNode(), python = onlyList ? "" : FindPython();
                string target = Path.GetFullPath(destination.Text);
                string tool = Path.Combine(root, "painel-backup.cjs");
                if (!File.Exists(Path.Combine(root, "tools", "OunceCake", "ouncecake.cjs"))) throw new Exception("A pasta tools\\OunceCake está faltando. Mantenha o programa completo nesta pasta.");
                worker = new Runner(); worker.SetEnvironment("NS2_PANEL_PYTHON", python);
                worker.Start(node, tool, "\"" + session + "\" " + address + " \"" + target + "\"" + (onlyList ? "" : " " + game.Title), root);
                complete = failed = cancelling = listed = false; listing = onlyList; backupFolder = null;
                if (onlyList) games.Items.Clear();
                list.Enabled = begin.Enabled = host.Enabled = destination.Enabled = games.Enabled = false; cancel.Enabled = true;
                output.Clear(); bar.Value = 0; status.Text = onlyList ? "Lendo os jogos instalados..." : "Preparando o backup...";
            } catch (Exception error) { if (worker != null) worker.Dispose(); worker = null; MessageBox.Show(this, error.Message, "Backup"); }
        }
        private void CancelTask() {
            if (worker == null || !worker.Alive) return;
            cancelling = true; worker.RequestCleanup(); cancel.Enabled = false;
            status.Text = "Cancelando e aguardando a limpeza. Arquivos parciais serão preservados.";
        }
        private void Poll(object sender, EventArgs args) {
            if (worker == null) return;
            foreach (string line in worker.Drain()) {
                output.AppendText(line + Environment.NewLine);
                if (!line.StartsWith("PANEL:")) continue;
                try {
                    var value = json.Deserialize<Dictionary<string, object>>(line.Substring(6));
                    string kind = Convert.ToString(value["kind"]);
                    if (kind == "games") {
                        foreach (var item in (System.Collections.IEnumerable)value["games"]) {
                            var game = (Dictionary<string, object>)item;
                            games.Items.Add(new GameChoice { Title = Convert.ToString(game["title"]), Name = Convert.ToString(game["name"]) });
                        }
                        if (games.Items.Count > 0) games.SelectedIndex = 0;
                    }
                    else if (kind == "destination") backupFolder = Convert.ToString(value["path"]);
                    else if (kind == "status" && !cancelling) status.Text = Convert.ToString(value["message"]);
                    else if (kind == "transfer") {
                        double done = Convert.ToDouble(value["done"]), total = Convert.ToDouble(value["total"]);
                        bar.Value = total > 0 ? (int)Math.Min(1000, 1000 * done / total) : 0;
                        status.Text = String.Format("Copiando: {0:0.00} / {1:0.00} GiB • {2}", done / 1073741824, total / 1073741824, value["file"]);
                    }
                    else if (kind == "files_done") status.Text = "Arquivos copiados. Aguardando limpeza do OunceCake...";
                    else if (kind == "complete") complete = true;
                    else if (kind == "listed") listed = true;
                    else if (kind == "error") { failed = true; status.Text = Convert.ToString(value["message"]); }
                } catch (Exception error) { failed = true; status.Text = "Resposta inválida: " + error.Message; }
            }
            if (!worker.Complete) return;
            bool success = worker.ExitCode == 0 && !failed && !cancelling && (listing ? listed : complete);
            RequiresRestart = !success;
            if (success) status.Text = listing ? "Lista pronta. Escolha um jogo e clique em Fazer backup." : "Backup concluído • tamanhos conferidos e SHA-256 local registrado.";
            else if (!failed) status.Text = "Operação incompleta. Confira os registros; o backup não foi marcado como concluído.";
            try {
                string folder = backupFolder ?? session;
                File.WriteAllText(Path.Combine(folder, "painel-backup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".log"), worker.Transcript);
            } catch { }
            worker.Dispose(); worker = null;
            list.Enabled = success; host.Enabled = destination.Enabled = games.Enabled = true; cancel.Enabled = false;
            begin.Enabled = success && games.SelectedItem != null;
            if (!success) status.Text += " Encerre a conexão e reinicie o console antes de tentar novamente.";
        }
        private void OpenFolder() {
            string folder = backupFolder ?? destination.Text;
            try {
                Directory.CreateDirectory(folder);
                Process.Start(new ProcessStartInfo("explorer.exe", "\"" + folder + "\"") { UseShellExecute = true });
            } catch (Exception error) { MessageBox.Show(this, error.Message); }
        }
    }
}
