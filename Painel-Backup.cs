
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
        public string Title, Name, ArchiveId;
        public override string ToString() { return Name + " [" + Title.ToUpperInvariant() + "]"; }
    }

    public sealed class BackupWindow : Form {
        private readonly string root, session;
        private readonly bool savesMode;
        private readonly TextBox host = new TextBox(), destination = new TextBox(), output = new TextBox();
        private readonly ComboBox games = new ComboBox();
        private readonly Button list = new Button(), begin = new Button(), cancel = new Button(), open = new Button();
        private readonly Label status = new Label();
        private readonly ProgressBar bar = new ProgressBar();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private Runner worker;
        private bool complete, failed, cancelling, listing, listed;
        private bool backendRequiresRestart = true;
        private string backupFolder;
        private string lastPhase;
        public bool RequiresRestart { get; private set; }
        public BackupWindow(string folder, string run) : this(folder, run, false) { }
        public BackupWindow(string folder, string run, bool forSaves) {
            root = folder; session = run; savesMode = forSaves;
            Text = savesMode ? "NS2 • Backup dos saves" : "NS2 • Backup dos seus jogos"; ClientSize = new Size(865, 610);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
            StartPosition = FormStartPosition.CenterParent; Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(245, 247, 251);
            AddLabel(savesMode ? "Backup dos saves • somente leitura" : "Backup dos seus jogos", 20, 15, 820, 35, 18, true);
            AddLabel(savesMode ? "Copia os saves em modo somente leitura. Restauração ainda não disponível." : "Exporta os arquivos do jogo em .tar com OunceCake. Não inclui saves ou chaves.", 22, 58, 820, 25, 10, false);
            AddLabel(savesMode ? "Liste os saves e confira o jogo e o identificador do usuário antes de copiar." : "IP do Switch 2 • detectado pela sessão; edite apenas se necessário", 22, 96, 820, 24, 10, false);
            host.SetBounds(22, 123, 240, 28); host.Visible = !savesMode; Controls.Add(host);
            if (!savesMode) host.Text = SessionAddress(run);
            list.Text = savesMode ? "Listar saves" : "Listar jogos"; list.SetBounds(savesMode ? 22 : 275, 121, 155, 32); list.Click += delegate { StartTask(true); }; Controls.Add(list);
            AddLabel(savesMode ? "Save para copiar (jogo e usuário)" : "Jogo para copiar", 22, 169, 500, 24, 10, true);
            games.SetBounds(22, 197, 820, 30); games.DropDownStyle = ComboBoxStyle.DropDownList; Controls.Add(games);
            AddLabel("Salvar no PC", 22, 243, 300, 24, 10, true);
            destination.Text = PanelSettings.Destination(savesMode ? "saves" : "games", Path.Combine(root, savesMode ? "saves-backups" : "backups")); destination.SetBounds(22, 270, 653, 28); Controls.Add(destination);
            destination.Leave += delegate { PersistDestination(); };
            var browse = new Button { Text = "Escolher pasta", Location = new Point(685, 268), Size = new Size(157, 32) };
            browse.Click += delegate { using (var picker = new FolderBrowserDialog()) { picker.Description = savesMode ? "Pasta para os backups de saves" : "Pasta para os backups dos jogos"; if (picker.ShowDialog(this) == DialogResult.OK) { destination.Text = picker.SelectedPath; PersistDestination(); } } }; Controls.Add(browse);
            begin.Text = "Fazer backup"; begin.SetBounds(22, 317, 155, 35); begin.Enabled = false; begin.Click += delegate { StartTask(false); }; Controls.Add(begin);
            cancel.Text = "Cancelar operação"; cancel.SetBounds(187, 317, 176, 35); cancel.Enabled = false; cancel.Click += delegate { CancelTask(); }; Controls.Add(cancel);
            open.Text = "Abrir pasta"; open.SetBounds(373, 317, 140, 35); open.Click += delegate { OpenFolder(); }; Controls.Add(open);
            status.Text = savesMode ? "Feche outros jogos. Clique em Listar saves para ler o inventário." : "Clique em Listar jogos. Com o campo vazio, o endereço será obtido da sessão."; status.SetBounds(22, 366, 820, 40); Controls.Add(status);
            bar.SetBounds(22, 410, 820, 12); bar.Maximum = 1000; Controls.Add(bar);
            output.SetBounds(22, 436, 820, 151); output.Multiline = true; output.ReadOnly = true; output.ScrollBars = ScrollBars.Both; output.WordWrap = false;
            output.Font = new Font("Consolas", 9); Controls.Add(output);
            games.SelectedIndexChanged += delegate { begin.Enabled = worker == null && !RequiresRestart && games.SelectedItem != null; };
            timer.Interval = 200; timer.Tick += Poll; timer.Start();
            FormClosing += delegate(object sender, FormClosingEventArgs args) {
                if (worker != null && worker.Alive) {
                    args.Cancel = true;
                    if (!cancelling) CancelTask();
                    return;
                }
                timer.Stop();
                PersistDestination();
            };
        }
        private void AddLabel(string text, int x, int y, int width, int height, int size, bool bold) {
            Controls.Add(new Label { Text = text, Location = new Point(x, y), Size = new Size(width, height), Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular) });
        }
        private void PersistDestination() {
            if (String.IsNullOrWhiteSpace(destination.Text)) return;
            try { PanelSettings.SaveDestination(savesMode ? "saves" : "games", destination.Text); }
            catch (Exception error) { status.Text = "Não foi possível lembrar esta pasta: " + error.Message; }
        }
        public static string SessionAddress(string run) {
            foreach (string file in new[] { "result.json", "connection.json" }) {
                string path = Path.Combine(run, file);
                if (!File.Exists(path)) continue;
                var value = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
                object raw; IPAddress address;
                if (value.TryGetValue("consoleAddress", out raw) && IPAddress.TryParse(Convert.ToString(raw), out address) && address.AddressFamily == AddressFamily.InterNetwork) return address.ToString();
            }
            return "";
        }
        private void StartTask(bool onlyList) {
            if (RequiresRestart) { MessageBox.Show(this, "Esta sessão precisa ser encerrada. Reinicie o console antes de outra operação."); return; }
            IPAddress address = null;
            if (!savesMode && host.Text.Trim().Length > 0 && (!IPAddress.TryParse(host.Text.Trim(), out address) || address.AddressFamily != AddressFamily.InterNetwork)) { MessageBox.Show(this, "Informe um IPv4 válido ou deixe o campo vazio para usar o endereço da sessão."); return; }
            var game = games.SelectedItem as GameChoice;
            if (!onlyList && game == null) return;
            try {
                string node = Checks.FindNode(root), python = onlyList || savesMode ? "" : Checks.FindPython(root);
                string target = Path.GetFullPath(destination.Text);
                PersistDestination();
                string tool = Path.Combine(root, savesMode ? "painel-saves.cjs" : "painel-backup.cjs");
                if (!File.Exists(Path.Combine(root, "tools", "OunceCake", "ouncecake.cjs"))) throw new Exception("A pasta tools\\OunceCake está faltando. Mantenha o programa completo nesta pasta.");
                if (savesMode && !File.Exists(Path.Combine(root, "tools", "ns2-savekit", "tools", "lib", "save-attr.cjs"))) throw new Exception("A dependência ns2-savekit está faltando. Atualize os submódulos do projeto.");
                worker = new Runner(); worker.SetEnvironment("NS2_PANEL_PYTHON", python);
                string arguments = savesMode ? Checks.QuoteArgument(session) + " " + (onlyList ? "list" : "backup") + " " + Checks.QuoteArgument(target) + (onlyList ? "" : " " + game.ArchiveId) :
                    Checks.QuoteArgument(session) + " " + (address == null ? "auto" : address.ToString()) + " " + Checks.QuoteArgument(target) + (onlyList ? "" : " " + game.Title + " " + Checks.QuoteArgument(game.Name));
                worker.Start(node, tool, arguments, root);
                complete = failed = cancelling = listed = false; listing = onlyList; backupFolder = null;
                backendRequiresRestart = true;
                if (onlyList) games.Items.Clear();
                list.Enabled = begin.Enabled = host.Enabled = destination.Enabled = games.Enabled = false; cancel.Enabled = true;
                output.Clear(); bar.Value = 0; status.Text = onlyList ? "Lendo o inventário do console..." : "Preparando o backup...";
                bar.Style = ProgressBarStyle.Marquee; lastPhase = "initial";
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
                    if (kind == "phase" && !cancelling && !failed) {
                        lastPhase = Convert.ToString(value["phase"]);
                        if (lastPhase != "transfer" && lastPhase != "save_copy") {
                            bar.Style = ProgressBarStyle.Marquee;
                            status.Text = String.Format("{0} • {1}s", value["operation"], value["elapsedSeconds"]);
                        }
                    }
                    else if (kind == "games") {
                        foreach (var item in (System.Collections.IEnumerable)value["games"]) {
                            var game = (Dictionary<string, object>)item;
                            games.Items.Add(new GameChoice { Title = Convert.ToString(game["title"]), Name = Convert.ToString(game["name"]) });
                        }
                        if (games.Items.Count > 0) games.SelectedIndex = 0;
                    }
                    else if (kind == "saves") {
                        foreach (var item in (System.Collections.IEnumerable)value["saves"]) {
                            var save = (Dictionary<string, object>)item;
                            string uid = Convert.ToString(save["uid"]);
                            string user = uid.Trim('0').Length == 0 ? "comum" : uid.Substring(0, 16);
                            games.Items.Add(new GameChoice { Title = Convert.ToString(save["title"]), ArchiveId = Convert.ToString(save["id"]),
                                Name = Convert.ToString(save["name"]) + " • usuário " + user + " • " + save["typeName"] });
                        }
                        if (games.Items.Count > 0) games.SelectedIndex = 0;
                    }
                    else if (kind == "destination") backupFolder = Convert.ToString(value["path"]);
                    else if (kind == "status" && !cancelling) status.Text = Convert.ToString(value["message"]);
                    else if (kind == "transfer") {
                        bar.Style = ProgressBarStyle.Continuous;
                        double done = Convert.ToDouble(value["done"]), total = Convert.ToDouble(value["total"]);
                        bar.Value = total > 0 ? (int)Math.Min(1000, 1000 * done / total) : 0;
                        status.Text = String.Format("Copiando: {0:0.00} / {1:0.00} GiB • {2}", done / 1073741824, total / 1073741824, value["file"]);
                    }
                    else if (kind == "files_done") status.Text = "Arquivos copiados. Aguardando o encerramento dos recursos...";
                    else if (kind == "complete") complete = true;
                    else if (kind == "listed") listed = true;
                    else if (kind == "error") { failed = true; backendRequiresRestart = !value.ContainsKey("requiresRestart") || Convert.ToBoolean(value["requiresRestart"]); status.Text = Convert.ToString(value.ContainsKey("summary") ? value["summary"] : value["message"]); }
                } catch (Exception error) { failed = true; status.Text = "Resposta inválida: " + error.Message; }
            }
            if (!worker.Complete) return;
            bool success = worker.ExitCode == 0 && !failed && !cancelling && (listing ? listed : complete);
            bar.Style = ProgressBarStyle.Continuous;
            bar.Value = success && !listing ? 1000 : 0;
            RequiresRestart = !success && (!failed || backendRequiresRestart);
            if (success) status.Text = listing ? (games.Items.Count == 0 ? "Nenhum item suportado foi encontrado neste inventário." : "Lista pronta. Escolha um item e clique em Fazer backup.") : "Backup concluído • tamanhos e hashes conferidos.";
            else if (!failed) status.Text = "Operação incompleta. Confira os registros; o backup não foi marcado como concluído.";
            try {
                string folder = backupFolder ?? session;
                File.WriteAllText(Path.Combine(folder, "painel-backup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff") + ".log"), worker.Transcript);
            } catch { }
            worker.Dispose(); worker = null;
            list.Enabled = !RequiresRestart; host.Enabled = destination.Enabled = games.Enabled = true; cancel.Enabled = false;
            begin.Enabled = !RequiresRestart && games.SelectedItem != null;
            if (RequiresRestart && !status.Text.Contains("reinicie")) status.Text += " Encerre a conexão e reinicie o console.";
        }
        private void OpenFolder() {
            string folder = backupFolder ?? destination.Text;
            try {
                Directory.CreateDirectory(folder);
                Process.Start(new ProcessStartInfo("explorer.exe", Checks.QuoteArgument(folder)) { UseShellExecute = true });
            } catch (Exception error) { MessageBox.Show(this, error.Message); }
        }
    }
}
