namespace NS2Panel {
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Drawing;
    using System.IO;
    using System.Windows.Forms;
    public sealed class KaihenWindow : Form {
        readonly string root,host,script;
        readonly Label status=new Label(),guide=new Label();
        readonly TextBox output=new TextBox();
        readonly CheckBox prepared=new CheckBox();
        readonly Button start=new Button(),cancel=new Button(),logs=new Button();
        readonly TextBox[] commands=new TextBox[4];
        readonly Button[] copy=new Button[4];
        readonly ProgressBar bar=new ProgressBar();
        readonly Timer timer=new Timer();
        readonly System.Web.Script.Serialization.JavaScriptSerializer json=new System.Web.Script.Serialization.JavaScriptSerializer();
        Runner worker;string run;bool waiting,connected,ready,complete,failed,closeRequested;
        public string SessionFolder {get{return run;}}
        public bool ReadyForGame {get{return ready&&complete&&!failed;}}
        public KaihenWindow(string folder,string address,string workerScript=null) {
            root=folder;host=address;script=workerScript??Path.Combine(root,"painel-kaihen.cjs");
            Text="NS2 • Homebrew / kaiHEN (teste)";ClientSize=new Size(940,745);Font=new Font("Segoe UI",10);
            BackColor=Color.FromArgb(245,247,251);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterParent;
            AddLabel("Homebrew no Switch 2",24,22,900,38,true);
            AddLabel("Ative kaiHEN, abra o hbmenu e teste o OunceShell incluído no pacote.",26,65,890,28,false);
            AddLabel("Modo exclusivo: comece com o console reiniciado e sem outra conexão ativa.",26,104,890,26,false);
            prepared.SetBounds(26,139,890,30);prepared.Text="Reiniciei o console; SmileBASIC está aberto na memória interna e o cartão SD está inserido.";Controls.Add(prepared);
            start.Text="Iniciar kaiHEN";start.SetBounds(26,181,195,38);start.Click+=delegate{Start();};Controls.Add(start);
            cancel.Text="Cancelar espera";cancel.SetBounds(234,181,190,38);cancel.Enabled=false;cancel.Click+=delegate{CancelWaiting();};Controls.Add(cancel);
            logs.Text="Abrir registros";logs.SetBounds(438,181,170,38);logs.Click+=delegate {string dir=run??Path.Combine(root,"runs");Directory.CreateDirectory(dir);Process.Start(new ProcessStartInfo("explorer.exe",Checks.QuoteArgument(dir)){UseShellExecute=true});};Controls.Add(logs);
            AddLabel("No SmileBASIC, modo Direct • uma linha por vez",26,237,890,26,false);
            string[] text={"LOAD \"NS2\"","RUN","REMOVE NSR,&H60000000,&H3FFFFFFF","Aguardando iniciar..."};
            for(int i=0;i<4;i++) {int index=i;commands[i]=new TextBox();commands[i].Text=text[i];commands[i].ReadOnly=true;commands[i].SetBounds(26,274+i*39,735,29);Controls.Add(commands[i]);copy[i]=new Button();copy[i].Text="Copiar";copy[i].SetBounds(776,272+i*39,133,32);copy[i].Enabled=false;copy[i].Click+=delegate{Clipboard.SetText(commands[index].Text);};Controls.Add(copy[i]);}
            status.SetBounds(26,444,883,47);status.Text="O PC "+host+" será usado para iniciar uma nova conexão. Os arquivos necessários já estão no pacote portátil.";Controls.Add(status);
            bar.SetBounds(26,495,883,12);bar.Maximum=5;Controls.Add(bar);
            guide.SetBounds(26,521,883,82);guide.Text="Aguarde a confirmação antes de fechar SmileBASIC. Depois, abra um jogo nativo de Switch 2 com R pressionado. A primeira abertura pode ser normal; feche o jogo e repita com R para abrir hbmenu. Escolha OunceShell para testar imagem, controles e leitura do SD.";Controls.Add(guide);
            output.SetBounds(26,616,883,105);output.Multiline=true;output.ReadOnly=true;output.ScrollBars=ScrollBars.Both;output.WordWrap=false;output.Font=new Font("Consolas",8);Controls.Add(output);
            timer.Interval=100;timer.Tick+=Poll;timer.Start();
            FormClosing+=delegate(object sender,FormClosingEventArgs args){if(worker!=null){args.Cancel=true;if(waiting&&!connected){closeRequested=true;CancelWaiting();}else MessageBox.Show(this,"Mantenha esta janela aberta. Após kaiHEN iniciado, feche SmileBASIC no console e aguarde a conclusão.","Operação no console");}else timer.Stop();};
        }
        void AddLabel(string text,int x,int y,int w,int h,bool heading){var label=new Label{Text=text};label.SetBounds(x,y,w,h);if(heading)label.Font=new Font("Segoe UI",20,FontStyle.Bold);Controls.Add(label);}
        void Start(){
            if(!prepared.Checked){MessageBox.Show(this,"Confira o preparo do console e marque a confirmação.","Antes de iniciar");return;}
            try{worker=new Runner();waiting=connected=ready=complete=failed=false;output.Clear();bar.Value=0;status.ForeColor=SystemColors.ControlText;
                worker.Start(Checks.FindNode(root),script,Checks.QuoteArgument(host),root);start.Enabled=prepared.Enabled=false;status.Text="Conferindo kaiHEN e preparando a conexão...";
            }catch(Exception error){if(worker!=null)worker.Dispose();worker=null;start.Enabled=prepared.Enabled=true;status.Text=error.Message;}
        }
        void CancelWaiting(){if(worker!=null&&waiting&&!connected){worker.RequestCleanup();cancel.Enabled=false;status.Text="Cancelando a espera pela conexão...";}}
        void ReadOutput(){foreach(string line in worker.Drain()){
            output.AppendText(line+Environment.NewLine);if(!line.StartsWith("PANEL:"))continue;
            try{var item=json.Deserialize<Dictionary<string,object>>(line.Substring(6));Accept(item);}catch(Exception error){failed=true;status.Text=error.Message;}
        }}
        void Accept(Dictionary<string,object> item){
            string kind=Convert.ToString(item["kind"]);
            if(kind=="kaihen_waiting"){waiting=true;cancel.Enabled=true;foreach(var button in copy)button.Enabled=true;status.Text=Convert.ToString(item["message"]);}
            else if(kind=="kaihen_run")run=Convert.ToString(item["path"]);
            else if(kind=="kaihen_command")commands[3].Text=Convert.ToString(item["command"]);
            else if(kind=="kaihen_connected"){connected=true;waiting=false;cancel.Enabled=false;foreach(var button in copy)button.Enabled=false;status.Text=Convert.ToString(item["message"]);}
            else if(kind=="kaihen_stage"){bar.Value=Math.Min(4,Convert.ToInt32(item["stage"]));status.Text="Etapa "+bar.Value+" de 4 • mantenha SmileBASIC aberto.";}
            else if(kind=="kaihen_loading")status.Text=Convert.ToString(item["message"]);
            else if(kind=="kaihen_ready"){ready=true;bar.Value=5;status.Text=Convert.ToString(item["message"]);status.ForeColor=Color.FromArgb(15,105,48);}
            else if(kind=="kaihen_closed"){complete=true;status.Text="SmileBASIC encerrado. O ambiente está pronto para o teste do launcher e do OunceShell.";guide.Text=Convert.ToString(item["message"]);if(item.ContainsKey("hostError")&&item["hostError"]!=null)output.AppendText("O host registrou um detalhe de encerramento; consulte painel-kaihen.json. A abertura do homebrew ainda precisa ser conferida."+Environment.NewLine);}
            else if(kind=="kaihen_cancelled"){complete=true;status.Text=Convert.ToString(item["message"]);}
            else if(kind=="error"){failed=true;status.ForeColor=Color.DarkRed;status.Text=Convert.ToString(item["summary"]);}
            else if(kind=="status")status.Text=Convert.ToString(item["message"]);
        }
        void Poll(object sender,EventArgs args){
            if(worker==null)return;ReadOutput();if(!worker.Complete)return;ReadOutput();
            if(worker.ExitCode!=0||!complete){if(!failed&&!ready)status.Text="kaiHEN não foi confirmado. Confira os registros e reinicie o console antes de tentar novamente.";failed=true;}
            try{string dir=run??Path.Combine(root,"runs");Directory.CreateDirectory(dir);File.WriteAllText(Path.Combine(dir,"painel-kaihen-"+DateTime.Now.ToString("yyyyMMdd-HHmmss-fff")+".log"),worker.Transcript);}catch{}
            worker.Dispose();worker=null;cancel.Enabled=false;foreach(var button in copy)button.Enabled=false;
            start.Enabled=prepared.Enabled=!ready;prepared.Checked=false;
            if(failed&&ready)guide.Text="A inicialização do HEN foi registrada, mas o host terminou de forma inesperada. Preserve os registros e reinicie antes de uma nova tentativa.";
            if(closeRequested)Close();
        }
    }
}
