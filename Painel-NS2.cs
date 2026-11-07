using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace NS2Panel {
    public enum RunState { Idle, Waiting, Running, Held, Verified, Failed, Stopped }

    public sealed class RunProgress {
        public RunState State = RunState.Idle;
        public int Stage;
        public string Folder;
        public string StartCommand;
        public void Accept(string line) {
            if (line.StartsWith("Run folder: ")) Folder = line.Substring(12).Trim();
            if (line.StartsWith("Waiting for Switch 2 at ")) State = RunState.Waiting;
            if (line.StartsWith("Connected. ")) State = RunState.Running;
            if (line.Trim().StartsWith("V=START(") && StartCommand == null) StartCommand = line.Trim();
            for (int i = 1; i <= 4; i++)
                if (line.StartsWith(i + "/4 ")) { Stage = i; State = RunState.Running; }
            if (line.StartsWith("4/4 verified. SmileBASIC RPC")) { Stage = 4; State = RunState.Held; }
            if (line.StartsWith("FS execution verified.")) { Stage = 4; State = RunState.Verified; }
        }
        public void Finish(int code) {
            // A bare zero exit or merely reaching stage 4 is not proof of success.
            if (code != 0 || (State != RunState.Verified && State != RunState.Held)) State = RunState.Failed;
            else if (State == RunState.Held) State = RunState.Stopped;
        }
    }

    public sealed class Runner : IDisposable {
        private Process process;
        private readonly object gate = new object();
        private readonly Queue<string> lines = new Queue<string>();
        private readonly StringBuilder transcript = new StringBuilder();
        private int readers;
        private bool exited;
        public int ExitCode { get; private set; }
        public bool Complete { get { lock (gate) return exited && readers == 2; } }
        public bool Alive { get { return process != null && !process.HasExited; } }
        public string Transcript { get { lock (gate) return transcript.ToString(); } }
        public void Start(string node, string script, string arguments, string root) {
            var info = new ProcessStartInfo(node, Checks.QuoteArgument(script) + " " + arguments);
            info.WorkingDirectory = root;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.RedirectStandardInput = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            foreach (var item in environment) info.EnvironmentVariables[item.Key] = item.Value;
            process = new Process();
            process.StartInfo = info;
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += Receive;
            process.ErrorDataReceived += Receive;
            process.Exited += delegate { lock (gate) { ExitCode = process.ExitCode; exited = true; } };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }
        private void Receive(object sender, DataReceivedEventArgs args) {
            lock (gate) {
                if (args.Data == null) { readers++; return; }
                lines.Enqueue(args.Data);
                transcript.AppendLine(args.Data);
            }
        }
        public string[] Drain() {
            lock (gate) { var result = lines.ToArray(); lines.Clear(); return result; }
        }
        public void Stop() {
            if (!Alive) return;
            // End only the process tree started by this window, including native workers.
            var info = new ProcessStartInfo("taskkill.exe", "/PID " + process.Id + " /T /F");
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            using (var killer = Process.Start(info)) killer.WaitForExit(5000);
        }
        public void RequestCleanup() {
            if (Alive) { process.StandardInput.WriteLine("stop"); process.StandardInput.Flush(); }
        }
        public void SetEnvironment(string name, string value) {
            // Used before Start through the dedicated optional setting below.
            environment[name] = value;
        }
        private readonly Dictionary<string, string> environment = new Dictionary<string, string>();
        public void Dispose() { if (process != null) process.Dispose(); }
    }

    public sealed class AddressChoice {
        public string Address, Name;
        public override string ToString() { return Name + " — " + Address; }
    }

    public sealed class MainWindow : Form {
        private readonly string root;
        private Runner runner;
        private RunProgress progress = new RunProgress();
        private readonly ComboBox addresses = new ComboBox();
        private readonly CheckBox held = new CheckBox();
        private readonly CheckBox prepared = new CheckBox();
        private readonly Button start = new Button(), stop = new Button(), logs = new Button();
        private readonly Button backup = new Button();
        private readonly Button saves = new Button();
        private readonly Button nup = new Button();
        private readonly Label status = new Label(), detail = new Label();
        private readonly TextBox output = new TextBox();
        private readonly TextBox[] commands = new TextBox[4];
        private readonly Button[] copy = new Button[4];
        private readonly ProgressBar bar = new ProgressBar();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private bool stopping;
        private bool cleaning;
        private bool backupFailed;

        public MainWindow(string folder) {
            root = folder;
            Text = "NS2 • Assistente de conexão" + (File.Exists(Path.Combine(root, "VERSION")) ? " • v" + File.ReadAllText(Path.Combine(root, "VERSION")).Trim() : "");
            ClientSize = new Size(920, 710);
            MinimumSize = new Size(936, 699);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(245, 247, 251);
            Font = new Font("Segoe UI", 10);
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 6 };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 64));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 148));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 203));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 87));
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            Controls.Add(layout);
            var header = new Panel { Dock = DockStyle.Fill };
            header.Controls.Add(new Label { Text = "NS2 • Assistente de conexão", Font = new Font("Segoe UI", 20, FontStyle.Bold), AutoSize = true, Location = new Point(0, 0) });
            header.Controls.Add(new Label { Text = "Inicie pelo PC e acompanhe os comandos no SmileBASIC.", AutoSize = true, Location = new Point(2, 41) });
            layout.Controls.Add(header);

            var connection = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(12) };
            connection.Controls.Add(new Label { Text = "Endereço do PC na rede cabeada", AutoSize = true, Location = new Point(12, 10) });
            addresses.SetBounds(12, 34, 470, 30);
            addresses.DropDownStyle = ComboBoxStyle.DropDownList;
            connection.Controls.Add(addresses);
            start.Text = "Iniciar conexão"; start.SetBounds(496, 32, 160, 34); start.Click += StartRun; connection.Controls.Add(start);
            stop.Text = "Interromper"; stop.SetBounds(668, 32, 155, 34); stop.Enabled = false; stop.Click += delegate { StopRun(); }; connection.Controls.Add(stop);
            held.Text = "Manter conexão aberta após 4/4 (--rpc)"; held.AutoSize = true; held.Location = new Point(12, 74); connection.Controls.Add(held);
            prepared.Text = "Reiniciei o console; SmileBASIC na memória interna; PC e Switch por cabo.";
            prepared.AutoSize = true; prepared.Location = new Point(12, 107); connection.Controls.Add(prepared);
            layout.Controls.Add(connection);

            var guide = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Margin = new Padding(0, 8, 0, 0) };
            guide.Controls.Add(new Label { Text = "No Switch: modo Direct • digite uma linha de cada vez", Font = new Font(Font, FontStyle.Bold), AutoSize = true, Location = new Point(12, 9) });
            string[] notes = { "Confirme o carregamento", "Espere DIST BOOT READY 1015", "Uma única vez; Out of memory é esperado", "Depois, mantenha o SmileBASIC aberto" };
            string[] text = { "LOAD \"NS2\"", "RUN", "REMOVE NSR,&H60000000,&H3FFFFFFF", "Inicie a conexão no PC primeiro" };
            for (int i = 0; i < 4; i++) {
                int index = i, y = 37 + i * 37;
                guide.Controls.Add(new Label { Text = (i + 1) + ".", AutoSize = true, Location = new Point(12, y + 4) });
                commands[i] = new TextBox { Text = text[i], ReadOnly = true, Font = new Font("Consolas", 10), Location = new Point(38, y), Size = new Size(393, 26) };
                guide.Controls.Add(commands[i]);
                copy[i] = new Button { Text = "Copiar", Location = new Point(441, y - 1), Size = new Size(75, 29), Enabled = false };
                copy[i].Click += delegate { try { Clipboard.SetText(commands[index].Text); } catch { MessageBox.Show(this, "Não foi possível copiar. Digite o texto mostrado."); } };
                guide.Controls.Add(copy[i]);
                guide.Controls.Add(new Label { Text = notes[i], AutoSize = true, Location = new Point(528, y + 4), Font = new Font("Segoe UI", 9) });
            }
            layout.Controls.Add(guide);
            var feedback = new Panel { Dock = DockStyle.Fill };
            status.Text = "Pronto para começar"; status.Font = new Font(Font, FontStyle.Bold); status.SetBounds(0, 10, 850, 24); feedback.Controls.Add(status);
            bar.SetBounds(0, 39, 855, 10); bar.Maximum = 4; bar.Anchor = AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Top; feedback.Controls.Add(bar);
            detail.Text = "Não repita RUN ou REMOVE depois de START. Após falha, reinicie o console.";
            detail.SetBounds(0, 56, 855, 26); detail.Font = new Font("Segoe UI", 9); feedback.Controls.Add(detail);
            layout.Controls.Add(feedback);
            output.Multiline = true; output.ReadOnly = true; output.ScrollBars = ScrollBars.Both; output.WordWrap = false;
            output.Dock = DockStyle.Fill; output.Font = new Font("Consolas", 9); output.BackColor = Color.FromArgb(23, 32, 49); output.ForeColor = Color.FromArgb(225, 233, 245);
            layout.Controls.Add(output);
            var footer = new Panel { Dock = DockStyle.Fill };
            logs.Text = "Abrir registros"; logs.SetBounds(0, 8, 145, 31); logs.Click += delegate { OpenLogs(); }; footer.Controls.Add(logs);
            backup.Text = "Backup dos jogos"; backup.SetBounds(155, 8, 157, 31); backup.Enabled = false;
            backup.Click += delegate {
                using (var dialog = new BackupWindow(root, progress.Folder)) {
                    dialog.ShowDialog(this);
                    if (dialog.RequiresRestart) backupFailed = true;
                }
            }; footer.Controls.Add(backup);
            saves.Text = "Backup de saves"; saves.SetBounds(322, 8, 150, 31); saves.Enabled = false;
            saves.Click += delegate { using (var dialog = new BackupWindow(root, progress.Folder, true)) { dialog.ShowDialog(this); if (dialog.RequiresRestart) backupFailed = true; } }; footer.Controls.Add(saves);
            nup.Text = "Gerar NUP"; nup.SetBounds(482, 8, 125, 31);
            nup.Click += delegate { using (var dialog = new NupWindow(root)) dialog.ShowDialog(this); }; footer.Controls.Add(nup);
            footer.Controls.Add(new Label { Text = "NUP: operação local no PC.", AutoSize = true, Font = new Font("Segoe UI", 9), Location = new Point(617, 15) });
            layout.Controls.Add(footer);
            LoadAddresses();
            timer.Interval = 150; timer.Tick += Poll; timer.Start();
            FormClosing += HandleFormClosing;
        }

        private void LoadAddresses() {
            var choices = new List<AddressChoice>();
            foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces()) {
                if (adapter.OperationalStatus != OperationalStatus.Up || adapter.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                foreach (var ip in adapter.GetIPProperties().UnicastAddresses) {
                    if (ip.Address.AddressFamily != AddressFamily.InterNetwork || ip.Address.ToString().StartsWith("169.254.")) continue;
                    if (ip.IPv4Mask.ToString() == "255.255.255.255") continue;
                    choices.Add(new AddressChoice { Address = ip.Address.ToString(), Name = adapter.Name });
                }
            }
            choices.Sort(delegate(AddressChoice a, AddressChoice b) {
                bool av = a.Name.StartsWith("v", StringComparison.OrdinalIgnoreCase), bv = b.Name.StartsWith("v", StringComparison.OrdinalIgnoreCase);
                return av != bv ? av.CompareTo(bv) : String.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
            });
            foreach (var choice in choices) addresses.Items.Add(choice);
            if (addresses.Items.Count > 0) addresses.SelectedIndex = 0;
        }

        private void StartRun(object sender, EventArgs args) {
            if (!prepared.Checked) { MessageBox.Show(this, "Reinicie completamente o Switch 2 e confira os requisitos. Depois marque a confirmação.", "Antes de iniciar"); return; }
            var choice = addresses.SelectedItem as AddressChoice;
            if (choice == null) { MessageBox.Show(this, "Conecte o PC à rede cabeada e abra o painel novamente."); return; }
            try {
                string node = Checks.FindNode(root);
                Checks.CheckNode(node, root);
                if (runner != null) runner.Dispose();
                runner = new Runner(); progress = new RunProgress(); stopping = false; cleaning = false; backupFailed = false;
                output.Clear(); bar.Value = 0;
                commands[3].Text = "Aguardando o programa iniciar...";
                foreach (var button in copy) button.Enabled = false;
                runner.Start(node, Path.Combine(root, "painel-runner.cjs"), (held.Checked ? "--rpc " : "") + choice.Address, root);
                start.Enabled = false; stop.Enabled = true; addresses.Enabled = held.Enabled = prepared.Enabled = false;
                status.Text = "Iniciando no PC...";
                detail.Text = "Aguarde a indicação de conexão pronta antes de digitar no console.";
            } catch (Exception error) { MessageBox.Show(this, error.Message, "Não foi possível iniciar"); }
        }

        private void Poll(object sender, EventArgs args) {
            if (runner == null) return;
            foreach (string line in runner.Drain()) {
                output.AppendText(line + Environment.NewLine);
                progress.Accept(line);
            }
            if (progress.StartCommand != null) commands[3].Text = progress.StartCommand;
            bar.Value = progress.Stage;
            backup.Enabled = progress.State == RunState.Held && !cleaning && !stopping && !backupFailed && runner.Alive;
            saves.Enabled = backup.Enabled;
            stop.Text = progress.State == RunState.Held ? "Encerrar conexão" : "Interromper";
            bool waiting = progress.State == RunState.Waiting;
            foreach (var button in copy) button.Enabled = waiting;
            if (!stopping) {
                if (waiting) { status.Text = "PC pronto • siga os quatro comandos no Switch"; detail.Text = "Se o Windows solicitar acesso à rede, permita na sua rede privada. Não desative o firewall."; }
                else if (progress.State == RunState.Running) { status.Text = "Etapa " + progress.Stage + " de 4 • trabalhando no console"; detail.Text = "Mantenha o SmileBASIC aberto e aguarde. Não digite outros comandos."; }
                else if (progress.State == RunState.Held) { status.Text = "4/4 confirmado • conexão mantida aberta"; detail.Text = "Ferramentas compatíveis podem usar esta sessão. Deixe o PC e o SmileBASIC ligados."; }
                else if (progress.State == RunState.Verified) status.Text = "Sucesso • execução no FS confirmada";
                if (cleaning) { status.Text = "Encerrando a sessão e aguardando a limpeza..."; detail.Text = "Mantenha o SmileBASIC aberto até a confirmação. Não feche esta janela."; }
                else if (backupFailed) { status.Text = "Uma operação encontrou um erro • encerre a conexão e reinicie o console"; detail.Text = "Os registros foram preservados. Não inicie outra operação nesta sessão."; }
            }
            if (!runner.Complete) return;
            foreach (string line in runner.Drain()) { output.AppendText(line + Environment.NewLine); progress.Accept(line); }
            if (!stopping) progress.Finish(runner.ExitCode);
            start.Enabled = true; stop.Enabled = false; addresses.Enabled = held.Enabled = prepared.Enabled = true; prepared.Checked = false;
            foreach (var button in copy) button.Enabled = false;
            backup.Enabled = false;
            saves.Enabled = false;
            if (stopping) { status.Text = "Tentativa interrompida • reinicie o console"; detail.Text = "A limpeza não foi confirmada. Reinicie completamente antes de tentar outra vez."; }
            else if (progress.State == RunState.Verified) { status.Text = "Sucesso • 4/4 verificado e limpeza concluída"; detail.Text = "A demonstração terminou e fechou a conexão. Reinicie o console para finalizar."; }
            else { status.Text = "Sessão encerrada • confira os registros e reinicie o console"; detail.Text = "RPC STOP no Switch não comprova sucesso. O resultado depende das verificações do PC."; }
            SaveTranscript();
            runner.Dispose(); runner = null;
        }

        private void SaveTranscript() {
            if (runner == null) return;
            try {
                string folder = progress.Folder;
                if (folder == null || !Directory.Exists(folder)) folder = Path.Combine(root, "runs");
                Directory.CreateDirectory(folder);
                File.WriteAllText(Path.Combine(folder, "painel.log"), runner.Transcript, Encoding.UTF8);
            } catch (Exception error) { output.AppendText("Não foi possível salvar o registro do painel: " + error.Message + Environment.NewLine); }
        }

        private void StopRun() {
            if (runner == null || !runner.Alive) return;
            if (progress.State == RunState.Held) {
                // The upstream runner closes a held session cleanly on SIGINT/SIGTERM.
                // Redirected Windows processes cannot reliably receive Ctrl-C here.
                if (MessageBox.Show(this, "Termine primeiro qualquer transferência em outra ferramenta. Deseja encerrar a conexão e aguardar a limpeza?", "Encerrar sessão", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
                cleaning = true; runner.RequestCleanup(); stop.Enabled = false; return;
            }
            stopping = true; runner.Stop(); stop.Enabled = false;
            SaveTranscript();
            status.Text = "Interrompendo • reinicie o console antes da próxima tentativa";
        }

        private void OpenLogs() {
            string folder = progress.Folder ?? Path.Combine(root, "runs");
            Directory.CreateDirectory(folder);
            Process.Start(new ProcessStartInfo("explorer.exe", "\"" + folder + "\"") { UseShellExecute = true });
        }

        private void HandleFormClosing(object sender, FormClosingEventArgs args) {
            if (runner != null && runner.Alive) {
                if (MessageBox.Show(this, "Há uma sessão em andamento. Fechar interrompe a execução e exige reiniciar o Switch 2. Deseja fechar?", "Sessão em andamento", MessageBoxButtons.YesNo) != DialogResult.Yes) { args.Cancel = true; return; }
                runner.Stop(); SaveTranscript();
            }
            timer.Stop(); if (runner != null) runner.Dispose();
        }
    }

    public static class PanelSettings {
        private static string SettingsFile {
            get { return Environment.GetEnvironmentVariable("NS2_PANEL_SETTINGS") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NS2ToolKit", "settings.json"); }
        }
        public static string Destination(string key, string fallback) {
            try {
                var values = new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<Dictionary<string, string>>(File.ReadAllText(SettingsFile));
                string value;
                if (values != null && values.TryGetValue(key, out value) && !String.IsNullOrWhiteSpace(value) && Path.IsPathRooted(value)) return value;
            } catch (IOException) { } catch (UnauthorizedAccessException) { } catch (ArgumentException) { } catch (InvalidOperationException) { }
            return fallback;
        }
        public static void SaveDestination(string key, string folder) {
            string file = SettingsFile;
            var json = new System.Web.Script.Serialization.JavaScriptSerializer();
            var values = new Dictionary<string, string>();
            if (File.Exists(file)) {
                try { values = json.Deserialize<Dictionary<string, string>>(File.ReadAllText(file)) ?? values; }
                catch (ArgumentException) { } catch (InvalidOperationException) { }
            }
            values[key] = Path.GetFullPath(folder);
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            string pending = file + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try {
                File.WriteAllText(pending, json.Serialize(values), new UTF8Encoding(false));
                if (File.Exists(file)) File.Replace(pending, file, null);
                else File.Move(pending, file);
            } finally { if (File.Exists(pending)) File.Delete(pending); }
        }
    }

    public static class Checks {
        public static string QuoteArgument(string value) {
            var quoted = new StringBuilder("\"");
            int slashes = 0;
            foreach (char character in value) {
                if (character == '\\') { slashes++; continue; }
                quoted.Append('\\', character == '"' ? slashes * 2 + 1 : slashes);
                quoted.Append(character); slashes = 0;
            }
            quoted.Append('\\', slashes * 2); quoted.Append('"');
            return quoted.ToString();
        }
        public static string FindNode(string root) {
            string portable = Path.Combine(root, "runtime", "node", "node.exe");
            if (File.Exists(portable)) return portable;
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string installed = Path.Combine(programFiles, "nodejs", "node.exe");
            if (File.Exists(installed)) return installed;
            foreach (string folder in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) {
                try { string candidate = Path.Combine(folder.Trim('"'), "node.exe"); if (File.Exists(candidate)) return candidate; } catch { }
            }
            throw new Exception("Node.js 22 ou superior não foi encontrado. Instale-o antes de iniciar.");
        }
        public static string FindPython(string root) {
            string portable = Path.Combine(root, "runtime", "python", "python.exe");
            if (File.Exists(portable)) return portable;
            foreach (string name in new[] { "python.exe", "py.exe" })
                foreach (string folder in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) {
                    try {
                        string candidate = Path.Combine(folder.Trim('"'), name);
                        if (!File.Exists(candidate)) continue;
                        using (var p = Process.Start(new ProcessStartInfo(candidate, "-c \"import sys; assert sys.version_info >= (3,10); print('NS2-PYTHON-OK')\"") {
                            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true })) {
                            if (p.WaitForExit(4000) && p.ExitCode == 0 && p.StandardOutput.ReadToEnd().Contains("NS2-PYTHON-OK")) return candidate;
                            if (!p.HasExited) p.Kill();
                        }
                    } catch { }
                }
            throw new Exception("Python não encontrado. Use o pacote portátil completo ou instale Python 3.10 ou superior.");
        }
        public static void CheckNode(string node, string folder) {
            var info = new ProcessStartInfo(node, "--version") { WorkingDirectory = folder, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
            using (var p = Process.Start(info)) {
                string version = p.StandardOutput.ReadToEnd().Trim().TrimStart('v');
                p.WaitForExit();
                int major;
                if (p.ExitCode != 0 || !Int32.TryParse(version.Split('.')[0], out major) || major < 22) throw new Exception("Este projeto precisa de Node.js 22 ou superior.");
            }
            if (!File.Exists(Path.Combine(folder, "run.cjs"))) throw new Exception("Mantenha os arquivos do painel na mesma pasta de run.cjs.");
            if (!File.Exists(Path.Combine(folder, "painel-runner.cjs"))) throw new Exception("O arquivo painel-runner.cjs está faltando nesta pasta.");
        }
        private static void Assert(bool condition, string message) { if (!condition) throw new Exception(message); }
        public static void Run(string root) {
            string node = FindNode(root); CheckNode(node, root);
            var nup = new NupProgress(); nup.Accept("PANEL:{\"kind\":\"pack\",\"done\":2,\"total\":3}");
            Assert(nup.Packed == 2 && nup.Total == 3 && !nup.Successful(0, false), "NUP packing is not completion");
            nup.Accept("PANEL:{\"kind\":\"activity\",\"message\":\"Compactando NUP: 123 bytes gravados\"}");
            Assert(nup.Packed == 2 && nup.Total == 3 && nup.Message.Contains("123 bytes"), "NUP activity preserves file progress");
            nup.Accept("PANEL:{\"kind\":\"complete\",\"path\":\"verified.nup\"}");
            Assert(nup.Successful(0, false) && !nup.Successful(1, false) && !nup.Successful(0, true), "NUP exit and cancellation checks failed");
            nup.Accept("PANEL:{\"kind\":\"error\",\"message\":\"invalid backup\"}");
            Assert(!nup.Successful(0, false), "NUP error must override completion");
            var p = new RunProgress(); p.Accept("4/4 Running the FS demo"); p.Finish(0);
            Assert(p.State == RunState.Failed, "Stage 4 alone must not report success");
            p = new RunProgress(); p.Accept("FS execution verified. Original instructions restored and scratch cleaned up."); p.Finish(0);
            Assert(p.State == RunState.Verified, "Verified run was not recognized");
            p = new RunProgress(); p.Accept("4/4 verified. SmileBASIC RPC and FS memory endpoint remain live while this process and the app stay open.");
            Assert(p.State == RunState.Held, "Held session was not recognized");
            p.Finish(1); Assert(p.State == RunState.Failed, "Failed cleanup must override held success");
            string mock = Path.Combine(Path.GetTempPath(), "ns2-panel-" + Guid.NewGuid().ToString("N") + ".cjs");
            try {
                File.WriteAllText(mock, "console.log('ARGS:'+JSON.stringify(process.argv.slice(2)));console.log('Waiting for Switch 2 at 127.0.0.1:39380.');console.log('  V=START(39380,127,0,0,1)');console.error('stderr captured');setTimeout(()=>{console.log('4/4 Running the FS demo');console.log('FS execution verified. Original instructions restored and scratch cleaned up.');},100);", new UTF8Encoding(false));
                using (var runner = new Runner()) {
                    runner.Start(node, mock, QuoteArgument(@"D:\") + " " + QuoteArgument("folder with spaces"), root);
                    var deadline = DateTime.UtcNow.AddSeconds(10);
                    while (!runner.Complete && DateTime.UtcNow < deadline) Thread.Sleep(25);
                    Assert(runner.Complete, "Runner did not terminate");
                    p = new RunProgress(); foreach (string line in runner.Drain()) p.Accept(line); p.Finish(runner.ExitCode);
                    Assert(p.State == RunState.Verified, "Process output did not reach the progress parser");
                    Assert(p.StartCommand == "V=START(39380,127,0,0,1)", "START parsing failed");
                    Assert(runner.Transcript.Contains("stderr captured"), "Standard error was lost");
                    string[] received = null;
                    foreach (string line in runner.Transcript.Split('\n'))
                        if (line.StartsWith("ARGS:")) received = new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<string[]>(line.Substring(5).Trim());
                    Assert(received != null && received.Length == 2 && received[0] == @"D:\" && received[1] == "folder with spaces", "Windows path arguments were changed");
                }
            } finally { File.Delete(mock); }
            Console.WriteLine("Painel: verificações de estado, processo, saída e comandos passaram. Nenhuma conexão com o console foi iniciada.");
        }
    }
}
