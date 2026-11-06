namespace NS2Panel {
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Drawing;
    using System.IO;
    using System.Web.Script.Serialization;
    using System.Windows.Forms;

    public sealed class HomebrewProgress {
        public string Message;
        public bool Failed, Complete;
        public Dictionary<string, object> Payload;

        public void Accept(string line) {
            if (!line.StartsWith("PANEL:")) return;
            try {
                var value = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(line.Substring(6));
                string kind = Convert.ToString(value["kind"]);
                if (kind == "status") {
                    Message = Convert.ToString(value["message"]);
                } else if (kind == "info") {
                    Payload = value.ContainsKey("payload") ? value["payload"] as Dictionary<string, object> : null;
                } else if (kind == "deployed") {
                    Complete = true;
                    Message = Convert.ToString(value["message"]);
                } else if (kind == "error") {
                    Failed = true;
                    Message = Convert.ToString(value["message"]);
                }
            } catch (Exception error) {
                Failed = true;
                Message = "Resposta inválida: " + error.Message;
            }
        }
    }

    public sealed class HomebrewWindow : Form {
        private readonly string root;
        private readonly string sessionFolder;
        private string selectedPayloadPath;
        private readonly Label status = new Label();
        private readonly Label sessionStatus = new Label();
        private readonly Label payloadName = new Label(), payloadSize = new Label(), payloadPathLabel = new Label();
        private readonly Button deployBtn = new Button(), browseBtn = new Button(), openBtn = new Button(), clearBtn = new Button();
        private readonly TextBox output = new TextBox();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private Runner worker;
        private HomebrewProgress progress = new HomebrewProgress();

        public HomebrewWindow(string folder, string session = null) {
            root = folder;
            sessionFolder = session;
            selectedPayloadPath = Path.Combine(root, "homebrew", "homebrew.bin");
            Text = "NS2 • Executar Homebrew";
            ClientSize = new Size(880, 600);
            MinimumSize = new Size(896, 620);
            StartPosition = FormStartPosition.CenterParent;
            Font = new Font("Segoe UI", 10);
            BackColor = Color.FromArgb(245, 247, 251);

            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(20), ColumnCount = 1, RowCount = 5 };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 68)); // Header
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 95)); // Payload & Session Info Cards
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 52)); // Action Buttons
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); // Terminal output
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 35)); // Footer status
            Controls.Add(layout);

            // 1. Header
            var header = new Panel { Dock = DockStyle.Fill };
            header.Controls.Add(new Label {
                Text = "Executar Homebrew (Nintendo Switch 2)",
                Font = new Font("Segoe UI", 16, FontStyle.Bold),
                Location = new Point(0, 0),
                AutoSize = true
            });
            header.Controls.Add(new Label {
                Text = "Carregamento e injeção de binários nativos AArch64 através da sessão RPC mantida (4/4).",
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(100, 116, 139),
                Location = new Point(2, 34),
                AutoSize = true
            });
            layout.Controls.Add(header);

            // 2. Cards de Informação
            var cardsPanel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = new Padding(0) };
            cardsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 60f));
            cardsPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 40f));

            // Card Payload
            var payloadCard = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(12), Margin = new Padding(4) };
            payloadCard.Paint += delegate(object s, PaintEventArgs e) {
                ControlPaint.DrawBorder(e.Graphics, payloadCard.ClientRectangle, Color.FromArgb(226, 232, 240), ButtonBorderStyle.Solid);
            };
            payloadCard.Controls.Add(new Label { Text = "Payload selecionado", Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), ForeColor = Color.FromArgb(100, 116, 139), Location = new Point(12, 10), AutoSize = true });
            payloadName.Text = "homebrew.bin";
            payloadName.Font = new Font("Segoe UI", 13, FontStyle.Bold);
            payloadName.ForeColor = Color.FromArgb(14, 116, 144);
            payloadName.Location = new Point(12, 30);
            payloadName.AutoSize = true;
            payloadCard.Controls.Add(payloadName);

            payloadSize.Text = "-- KB";
            payloadSize.Font = new Font("Segoe UI", 9.5f);
            payloadSize.ForeColor = Color.FromArgb(71, 85, 105);
            payloadSize.Location = new Point(12, 58);
            payloadSize.AutoSize = true;
            payloadCard.Controls.Add(payloadSize);

            browseBtn.Text = "Trocar payload...";
            browseBtn.Font = new Font("Segoe UI", 8.5f);
            browseBtn.SetBounds(350, 28, 140, 30);
            browseBtn.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            browseBtn.Click += delegate { SelectCustomPayload(); };
            payloadCard.Controls.Add(browseBtn);
            cardsPanel.Controls.Add(payloadCard, 0, 0);

            // Card Sessão Console
            var sessionCard = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(12), Margin = new Padding(4) };
            sessionCard.Paint += delegate(object s, PaintEventArgs e) {
                ControlPaint.DrawBorder(e.Graphics, sessionCard.ClientRectangle, Color.FromArgb(226, 232, 240), ButtonBorderStyle.Solid);
            };
            sessionCard.Controls.Add(new Label { Text = "Status da Conexão Console", Font = new Font("Segoe UI", 8.5f, FontStyle.Bold), ForeColor = Color.FromArgb(100, 116, 139), Location = new Point(12, 10), AutoSize = true });
            sessionStatus.Font = new Font("Segoe UI", 12, FontStyle.Bold);
            sessionStatus.Location = new Point(12, 35);
            sessionStatus.AutoSize = true;
            sessionCard.Controls.Add(sessionStatus);
            cardsPanel.Controls.Add(sessionCard, 1, 0);

            layout.Controls.Add(cardsPanel);

            // 3. Botões de Ação
            var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Margin = new Padding(0, 8, 0, 0) };
            deployBtn.Text = "🚀 Executar no Console";
            deployBtn.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            deployBtn.Size = new Size(200, 36);
            deployBtn.Click += delegate { StartDeploy(); };
            actions.Controls.Add(deployBtn);

            openBtn.Text = "📁 Abrir Pasta de Payloads";
            openBtn.Size = new Size(200, 36);
            openBtn.Click += delegate { OpenSourceFolder(); };
            actions.Controls.Add(openBtn);

            clearBtn.Text = "Limpar Terminal";
            clearBtn.Size = new Size(130, 36);
            clearBtn.Click += delegate { output.Clear(); };
            actions.Controls.Add(clearBtn);

            layout.Controls.Add(actions);

            // 4. Terminal Output
            output.Multiline = true;
            output.ReadOnly = true;
            output.ScrollBars = ScrollBars.Both;
            output.WordWrap = false;
            output.Dock = DockStyle.Fill;
            output.Font = new Font("Consolas", 9.5f);
            output.BackColor = Color.FromArgb(23, 32, 49);
            output.ForeColor = Color.FromArgb(225, 233, 245);
            output.Margin = new Padding(0, 10, 0, 10);
            layout.Controls.Add(output);

            // 5. Footer Status
            var footer = new Panel { Dock = DockStyle.Fill };
            status.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            status.Location = new Point(0, 6);
            status.AutoSize = true;
            status.Text = "Pronto";
            footer.Controls.Add(status);

            layout.Controls.Add(footer);

            timer.Interval = 120;
            timer.Tick += Poll;
            timer.Start();

            FormClosing += delegate {
                if (worker != null) { worker.Dispose(); worker = null; }
                timer.Stop();
            };

            RefreshInfo();
        }

        private void RefreshInfo() {
            try {
                string node = Checks.FindNode(root);
                using (var infoWorker = new Runner()) {
                    string arg = "--info " + Checks.QuoteArgument(selectedPayloadPath);
                    infoWorker.Start(node, Path.Combine(root, "painel-homebrew.cjs"), arg, root);
                    while (!infoWorker.Complete) {
                        System.Threading.Thread.Sleep(50);
                        foreach (string line in infoWorker.Drain()) progress.Accept(line);
                    }
                }
                UpdatePayloadLabels();
                bool hasLiveSession = !String.IsNullOrEmpty(sessionFolder) && File.Exists(Path.Combine(sessionFolder, "connection.json"));
                sessionStatus.Text = hasLiveSession ? "● RPC Conectado (4/4)" : "○ Aguardando Sessão 4/4";
                sessionStatus.ForeColor = hasLiveSession ? Color.FromArgb(21, 128, 61) : Color.FromArgb(148, 163, 184);
            } catch (Exception err) {
                status.Text = "Erro ao ler payload: " + err.Message;
            }
        }

        private void UpdatePayloadLabels() {
            if (progress.Payload != null && progress.Payload.ContainsKey("exists") && Convert.ToBoolean(progress.Payload["exists"])) {
                payloadName.Text = Convert.ToString(progress.Payload["name"]);
                double bytes = Convert.ToDouble(progress.Payload["size"]);
                payloadSize.Text = (bytes / 1024.0).ToString("F1") + " KB • " + Convert.ToString(progress.Payload["path"]);
                deployBtn.Enabled = true;
            } else {
                payloadName.Text = "Nenhum payload encontrado";
                payloadSize.Text = "Coloque o arquivo homebrew.bin na pasta ou selecione outro.";
                deployBtn.Enabled = false;
            }
        }

        private void SelectCustomPayload() {
            using (var dialog = new OpenFileDialog()) {
                dialog.Title = "Selecionar Payload Homebrew";
                dialog.Filter = "Arquivos de Payload (*.bin;*.elf;*.nso)|*.bin;*.elf;*.nso|Todos os arquivos (*.*)|*.*";
                dialog.InitialDirectory = Path.Combine(root, "homebrew");
                if (dialog.ShowDialog(this) == DialogResult.OK) {
                    selectedPayloadPath = dialog.FileName;
                    RefreshInfo();
                    output.AppendText("[SELEÇÃO] Novo payload selecionado: " + selectedPayloadPath + Environment.NewLine);
                }
            }
        }

        private void StartDeploy() {
            if (worker != null && worker.Alive) return;
            if (String.IsNullOrEmpty(sessionFolder) || !File.Exists(Path.Combine(sessionFolder, "connection.json"))) {
                MessageBox.Show(this,
                    "Para executar no Switch 2, é necessário que uma sessão com conexão mantida esteja ativa no console.\n\n" +
                    "1. Na tela principal, marque 'Manter conexão aberta após 4/4'.\n" +
                    "2. Clique em 'Iniciar conexão' e conclua os 4 passos no console.\n" +
                    "3. Quando o status indicar '4/4 confirmado', clique em 'Executar no Console'.",
                    "Sessão RPC Necessária", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            try {
                string node = Checks.FindNode(root);
                deployBtn.Enabled = false;
                status.Text = "Transmitindo e preparando payload no console...";
                status.ForeColor = Color.FromArgb(14, 116, 144);
                output.AppendText(Environment.NewLine + "=== DISPARANDO EXECUÇÃO VIA RPC ===" + Environment.NewLine);
                worker = new Runner();
                string args = "--deploy " + Checks.QuoteArgument(sessionFolder) + " " + Checks.QuoteArgument(selectedPayloadPath);
                worker.Start(node, Path.Combine(root, "painel-homebrew.cjs"), args, root);
            } catch (Exception err) {
                deployBtn.Enabled = true;
                MessageBox.Show(this, err.Message, "Erro ao executar");
            }
        }

        private void OpenSourceFolder() {
            try {
                string path = Path.Combine(root, "homebrew");
                Directory.CreateDirectory(path);
                Process.Start(new ProcessStartInfo("explorer.exe", Checks.QuoteArgument(path)) { UseShellExecute = true });
            } catch (Exception err) {
                MessageBox.Show(this, err.Message, "Erro ao abrir pasta");
            }
        }

        private void Poll(object sender, EventArgs e) {
            if (worker == null) return;
            foreach (string line in worker.Drain()) {
                output.AppendText(line + Environment.NewLine);
                progress.Accept(line);
            }
            if (worker.Complete) {
                deployBtn.Enabled = true;
                UpdatePayloadLabels();
                if (worker.ExitCode == 0 && !progress.Failed) {
                    status.Text = progress.Message ?? "Payload executado com sucesso!";
                    status.ForeColor = Color.FromArgb(21, 128, 61);
                } else {
                    status.Text = progress.Message ?? "Falha na execução (código " + worker.ExitCode + ")";
                    status.ForeColor = Color.FromArgb(185, 28, 28);
                }
                worker.Dispose();
                worker = null;
            }
        }
    }
}
