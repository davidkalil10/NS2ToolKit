namespace NS2Mods {
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;
using NS2Panel;

    public sealed class SessionChoice {
        public string Path, Name;
        public override string ToString() { return Name + " — conexão disponível"; }
    }
    public sealed class ModsWindow : Form {
        readonly string root;
        readonly TextBox source = new TextBox(), destination = new TextBox(), details = new TextBox();
        readonly Label plan = new Label(), status = new Label();
        readonly ComboBox sessions = new ComboBox();
        readonly Button choose = new Button(), output = new Button(), prepare = new Button(), refresh = new Button(), locate = new Button(), install = new Button(), open = new Button();
        readonly CheckBox profile = new CheckBox(), showDetails = new CheckBox();
        readonly ProgressBar progress = new ProgressBar();
        readonly Timer timer = new Timer();
        readonly System.Web.Script.Serialization.JavaScriptSerializer json = new System.Web.Script.Serialization.JavaScriptSerializer();
        Runner worker;
        string job, name, command;
        bool failed, completed, ready, needsRestart;

        public ModsWindow(string folder, bool renderOnly = false) {
            root = folder; Text = "NS2ToolKit • Mods GBA";
            Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(245,247,251);
            ClientSize = new Size(960,775); FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen;
            AddLabel("Mods GBA no console",24,23,900,38,true);
            AddLabel("Selecione o NUP da ferramenta GBA. O assistente prepara, envia ao SD e ativa o mod.",26,66,900,30,false);
            AddLabel("1. Arquivo NUP",26,105,720,25,false);
            source.SetBounds(26,134,728,30); source.Text = PanelSettings.Destination("mods-source", ""); Controls.Add(source);
            ButtonAt(choose,"Escolher NUP",768,132,164,34);
            choose.Click += delegate { using(var picker = new OpenFileDialog()) { picker.Filter="Pacote NUP (*.nup)|*.nup"; if(File.Exists(source.Text))picker.FileName=source.Text; if(picker.ShowDialog(this)==DialogResult.OK)source.Text=picker.FileName; } };
            AddLabel("Salvar a preparação e as cópias anteriores em",26,178,900,25,false);
            destination.SetBounds(26,206,728,30);
            string fallback = Directory.Exists(@"D:\Games") ? @"D:\Games\NS2ToolKit-mods\Preparados" : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"NS2ToolKit Mods");
            destination.Text = PanelSettings.Destination("mods-prepared",fallback); Controls.Add(destination);
            ButtonAt(output,"Escolher pasta",768,204,164,34);
            output.Click += delegate { using(var picker = new FolderBrowserDialog()) { if(Directory.Exists(destination.Text))picker.SelectedPath=destination.Text; if(picker.ShowDialog(this)==DialogResult.OK)destination.Text=picker.SelectedPath; } };
            ButtonAt(prepare,"Preparar mod",26,253,200,39); prepare.Click += delegate { Prepare(); };
            ButtonAt(open,"Abrir preparação",242,253,200,39); open.Click += delegate { if(job!=null)Process.Start(new ProcessStartInfo("explorer.exe",Checks.QuoteArgument(job)){UseShellExecute=true}); };
            plan.SetBounds(26,306,906,70); plan.BackColor=Color.White; plan.Padding=new Padding(10); plan.Text="Base: Pokémon FireRed [0100554023408000].\nSerão aplicados a ROM e o executável. Nome e capa no HOME continuam como FireRed."; Controls.Add(plan);
            AddLabel("2. Console conectado em 4/4",26,394,900,27,false);
            sessions.SetBounds(26,427,546,32); sessions.DropDownStyle=ComboBoxStyle.DropDownList; sessions.SelectedIndexChanged+=delegate { SetOptions(); }; Controls.Add(sessions);
            ButtonAt(refresh,"Atualizar",587,424,120,36); refresh.Click+=delegate { FindSessions(null); };
            ButtonAt(locate,"Localizar assistente",720,424,212,36);
            locate.Click+=delegate { using(var picker=new FolderBrowserDialog()) { picker.Description="Escolha a pasta que contém NS2 Assistente.exe e runs."; string last=PanelSettings.Destination("mods-assistant",root); if(Directory.Exists(last))picker.SelectedPath=last; if(picker.ShowDialog(this)==DialogResult.OK){PanelSettings.SaveDestination("mods-assistant",picker.SelectedPath);FindSessions(picker.SelectedPath);} } };
            profile.SetBounds(26,475,900,30); profile.Text="O jogo está fechado e vou usar um perfil de teste para o save."; profile.CheckedChanged+=delegate { SetOptions(); }; Controls.Add(profile);
            ButtonAt(install,"Enviar e ativar",26,521,220,42); install.Click+=delegate { Install(); };
            status.SetBounds(26,579,906,65); status.Text="Prepare o NUP. Para ativar, mantenha o assistente principal em 4/4 e desmonte o FTP."; Controls.Add(status);
            progress.SetBounds(26,651,906,10); Controls.Add(progress);
            showDetails.SetBounds(26,675,280,26); showDetails.Text="Mostrar detalhes da execução"; showDetails.CheckedChanged+=delegate { details.Visible=showDetails.Checked; }; Controls.Add(showDetails);
            details.SetBounds(26,709,906,50); details.Multiline=true; details.ReadOnly=true; details.ScrollBars=ScrollBars.Both; details.WordWrap=false; details.Font=new Font("Consolas",8); details.Visible=false; Controls.Add(details);
            source.TextChanged+=delegate { job=null; name=null; SetOptions(); };
            destination.TextChanged+=delegate { job=null; name=null; SetOptions(); };
            timer.Interval=100; timer.Tick+=Poll; timer.Start();
            if(!renderOnly)Shown+=delegate { FindSessions(PanelSettings.Destination("mods-assistant",root)); };
            FormClosing+=delegate(object sender,FormClosingEventArgs args) { if(worker!=null){args.Cancel=true;MessageBox.Show(this,"Aguarde a operação terminar antes de fechar esta janela.","Operação em andamento");}else timer.Stop(); };
            SetOptions();
        }
        void AddLabel(string text,int x,int y,int w,int h,bool heading) { var label=new Label();label.Text=text;label.SetBounds(x,y,w,h);if(heading)label.Font=new Font("Segoe UI",20,FontStyle.Bold);Controls.Add(label); }
        void ButtonAt(Button button,string text,int x,int y,int w,int h) { button.Text=text;button.SetBounds(x,y,w,h);Controls.Add(button); }
        void SetOptions() {
            bool idle=worker==null;
            source.Enabled=destination.Enabled=choose.Enabled=output.Enabled=prepare.Enabled=idle;
            refresh.Enabled=locate.Enabled=sessions.Enabled=idle&&!ready;
            profile.Enabled=idle&&!ready;
            open.Enabled=job!=null&&Directory.Exists(job);
            install.Enabled=idle&&!ready&&!needsRestart&&job!=null&&sessions.SelectedItem!=null&&profile.Checked;
        }
        void Begin(string kind,string arguments) {
            command=kind;failed=completed=false; details.Clear();status.ForeColor=SystemColors.ControlText;
            var next=new Runner();
            try { next.Start(Checks.FindNode(root),Path.Combine(root,"painel-mods.cjs"),kind+" "+arguments,root);worker=next;progress.Style=ProgressBarStyle.Marquee;SetOptions(); }
            catch { next.Dispose();throw; }
        }
        void FindSessions(string assistant) {
            if(worker!=null||ready)return;
            try { status.Text="Procurando uma conexão disponível...";Begin("sessions",assistant==null?"":Checks.QuoteArgument(assistant)); }
            catch(Exception error){status.Text=error.Message;SetOptions();}
        }
        void Prepare() {
            try {
                if(!File.Exists(source.Text)||!source.Text.EndsWith(".nup",StringComparison.OrdinalIgnoreCase))throw new Exception("Escolha o arquivo .nup gerado pela ferramenta GBA.");
                job=null;ready=false;
                PanelSettings.SaveDestination("mods-source",source.Text);PanelSettings.SaveDestination("mods-prepared",destination.Text);
                status.Text="Conferindo o NUP e preparando os arquivos...";
                Begin("prepare",Checks.QuoteArgument(Path.GetFullPath(source.Text))+" "+Checks.QuoteArgument(Path.GetFullPath(destination.Text)));
            }catch(Exception error){status.Text=error.Message;SetOptions();}
        }
        void Install() {
            var session=sessions.SelectedItem as SessionChoice;if(session==null||job==null)return;
            string message="Aplicar "+name+" sobre o FireRed?\n\nSerão enviados a ROM e o executável para a pasta de mods do SD. Arquivos anteriores diferentes terão cópia no PC antes da substituição.\n\nA ativação dura até reiniciar o console. O jogo usa o destino de save do FireRed no perfil escolhido.";
            if(MessageBox.Show(this,message,"Confirmar aplicação do mod",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
            try {status.Text="Enviando e conferindo os arquivos no SD. Aguarde a conclusão.";Begin("install",Checks.QuoteArgument(job)+" "+Checks.QuoteArgument(session.Path));}
            catch(Exception error){status.Text=error.Message;SetOptions();}
        }
        void ReadOutput() {
            foreach(string line in worker.Drain()) {
                details.AppendText(line+Environment.NewLine);
                if(!line.StartsWith("PANEL:"))continue;
                try {
                    var value=json.Deserialize<Dictionary<string,object>>(line.Substring(6));string kind=Convert.ToString(value["kind"]);
                    if(kind=="mod_sessions") {
                        sessions.Items.Clear();
                        foreach(var entry in (System.Collections.IEnumerable)value["sessions"]) {var item=(Dictionary<string,object>)entry;sessions.Items.Add(new SessionChoice{Path=Convert.ToString(item["path"]),Name=Convert.ToString(item["name"])});}
                        if(sessions.Items.Count>0){sessions.SelectedIndex=0;needsRestart=false;}
                        status.Text=sessions.Items.Count>0?"Conexão encontrada. Prepare o NUP e confira o plano para ativar.":"Nenhuma conexão disponível. Mantenha o assistente principal em 4/4, desmonte o FTP e clique em Atualizar.";completed=true;
                    }else if(kind=="mod_prepared") {
                        job=Convert.ToString(value["path"]);var report=(Dictionary<string,object>)value["report"];name=Convert.ToString(report["name"]);
                        plan.Text=name+"\nROM + executável sobre FireRed [0100554023408000]. Nome/capa no HOME continuam FireRed.";
                        status.Text="Preparação concluída. Selecione a conexão, confirme o perfil de teste e clique em Enviar e ativar.";completed=true;
                    }else if(kind=="mod_ready") {
                        ready=true;completed=true;sessions.Items.Clear();status.Text=Convert.ToString(value["message"]);status.ForeColor=Color.FromArgb(15,105,48);
                    }else if(kind=="error") {
                        failed=true;status.Text=Convert.ToString(value["summary"]);
                        if(value.ContainsKey("requiresRestart")&&Convert.ToBoolean(value["requiresRestart"])) {needsRestart=true;status.Text+=" Encerre a conexão e reinicie o console antes de tentar novamente.";}
                    }else if(kind=="transfer") status.Text="Transferindo e conferindo: "+Convert.ToDouble(value["done"]).ToString("N0")+" / "+Convert.ToDouble(value["total"]).ToString("N0")+" bytes";
                    else if((kind=="status"||kind=="writing")&&!failed)status.Text=Convert.ToString(value["message"]);
                }catch(Exception error){failed=true;status.Text="Não foi possível interpretar o resultado: "+error.Message;}
            }
        }
        void Poll(object sender,EventArgs args) {
            if(worker==null)return;ReadOutput();if(!worker.Complete)return;ReadOutput();
            if((worker.ExitCode!=0||!completed)&&!failed)status.Text="A operação não confirmou a conclusão. Consulte os detalhes da execução.";
            try{string logs=Path.Combine(root,"logs");Directory.CreateDirectory(logs);File.WriteAllText(Path.Combine(logs,"mods-"+command+"-"+DateTime.Now.ToString("yyyyMMdd-HHmmss-fff")+".log"),worker.Transcript,new UTF8Encoding(false));}catch{}
            worker.Dispose();worker=null;progress.Style=ProgressBarStyle.Blocks;progress.Value=completed&&!failed?100:0;SetOptions();
        }
        public void Render(string file) { ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;Location=new Point(-20000,-20000);Show();Application.DoEvents();using(var bitmap=new Bitmap(Width,Height)) { DrawToBitmap(bitmap,new Rectangle(0,0,Width,Height));bitmap.Save(file); } Hide(); }
    }
    public static class ModsEntry {
        [STAThread]
        public static void Main(string[] args) {
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
            try { bool render=args.Length==2&&args[0]=="--render";using(var window=new ModsWindow(AppDomain.CurrentDomain.BaseDirectory,render)) { if(render){window.Render(args[1]);return;}Application.Run(window); } }
            catch(Exception error){MessageBox.Show(error.Message,"NS2ToolKit • Mods GBA");}
        }
    }
}
