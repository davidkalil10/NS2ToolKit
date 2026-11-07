namespace NS2Panel {
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Drawing;
    using System.IO;
    using System.Text;
    using System.Web.Script.Serialization;
    using System.Windows.Forms;

    public sealed class RestoreTarget {
        public string Id, Title, User, Name;
        public override string ToString() {return Name+" ["+Title.ToUpperInvariant()+"] • usuário "+(User.Trim('0').Length==0?"compartilhado":User.Substring(0,16));}
    }
    public sealed class RestoreWindow : Form {
        private readonly string root, session;
        private readonly TextBox source = new TextBox(), output = new TextBox();
        private readonly ComboBox targets = new ComboBox();
        private readonly Button list = new Button(), begin = new Button(), cancel = new Button(), open = new Button(), browse = new Button();
        private readonly Label status = new Label();
        private readonly ProgressBar bar = new ProgressBar();
        private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private Runner worker;
        private string action, folder, planPath, planHash, confirmation;
        private List<string> selected;
        private bool failed, received, writing, cancelling;
        public bool RequiresRestart {get; private set;}
        public RestoreWindow(string rootFolder, string run) {
            root=rootFolder; session=run; Text="NS2 • Restaurar save"; ClientSize=new Size(900,535);
            FormBorderStyle=FormBorderStyle.FixedDialog; MaximizeBox=false; StartPosition=FormStartPosition.CenterParent;
            Font=new Font("Segoe UI",10); BackColor=Color.FromArgb(245,247,251);
            AddLabel("Restaurar save",22,16,855,35,true);
            AddLabel("Escolha a pasta e o destino. O pré-backup é automático; a gravação pede confirmação.",22,61,855,27,false);
            AddLabel("Pasta com os arquivos do save",22,103,855,24,false);
            source.SetBounds(22,132,650,28); source.Text=PanelSettings.Destination("saves",Path.Combine(root,"saves-backups")); Controls.Add(source);
            browse.Text="Escolher pasta"; browse.SetBounds(682,130,193,32);
            browse.Click+=delegate {using(var picker=new FolderBrowserDialog()) {
                picker.Description="Pasta do backup ou sua subpasta data";
                if(Directory.Exists(source.Text))picker.SelectedPath=source.Text;
                if(picker.ShowDialog(this)==DialogResult.OK){source.Text=picker.SelectedPath; SelectSourceTarget();}
            }}; Controls.Add(browse);
            AddLabel("Destino no console • jogo e usuário",22,179,855,24,false);
            targets.SetBounds(22,208,650,30); targets.DropDownStyle=ComboBoxStyle.DropDownList; targets.DropDownWidth=850; Controls.Add(targets);
            list.Text="Ler do console"; list.SetBounds(682,206,193,33); list.Click+=delegate {Start("list");}; Controls.Add(list);
            AddLabel("Pré-backup e registros serão guardados ao lado da pasta de origem, em restauracoes.",22,255,855,26,false);
            begin.Text="Restaurar save"; begin.SetBounds(22,298,190,35); begin.Enabled=false;
            begin.Click+=delegate {selected=null;planPath=planHash=null;Start("inspect");}; Controls.Add(begin);
            cancel.Text="Cancelar"; cancel.SetBounds(222,298,145,35); cancel.Enabled=false;
            cancel.Click+=delegate {if(worker!=null && !writing){cancelling=true;worker.RequestCleanup();cancel.Enabled=false;status.Text="Cancelamento solicitado. Aguardando limpeza...";}}; Controls.Add(cancel);
            open.Text="Abrir pré-backup / registros"; open.SetBounds(377,298,245,35);
            open.Click+=delegate {try {string selectedFolder=folder??JobsParent();Directory.CreateDirectory(selectedFolder);Process.Start(new ProcessStartInfo("explorer.exe",Checks.QuoteArgument(selectedFolder)){UseShellExecute=true});}catch(Exception error){MessageBox.Show(this,error.Message);}};
            Controls.Add(open);
            status.SetBounds(22,350,853,46);status.Text="Feche o jogo no console. Escolha a pasta e leia os destinos disponíveis.";Controls.Add(status);
            bar.SetBounds(22,402,853,12);bar.Maximum=1000;Controls.Add(bar);
            output.SetBounds(22,431,853,84);output.Multiline=true;output.ReadOnly=true;output.ScrollBars=ScrollBars.Both;
            output.WordWrap=false;output.Font=new Font("Consolas",9);Controls.Add(output);
            targets.SelectedIndexChanged+=delegate {if(worker==null)begin.Enabled=!RequiresRestart && targets.SelectedItem!=null;};
            timer.Interval=200;timer.Tick+=Poll;timer.Start();
            FormClosing+=delegate(object sender,FormClosingEventArgs args){if(worker!=null){args.Cancel=true;if(!writing){cancelling=true;worker.RequestCleanup();}return;}timer.Stop();};
        }
        private void AddLabel(string text,int x,int y,int width,int height,bool bold) {
            Controls.Add(new Label {Text=text,Location=new Point(x,y),Size=new Size(width,height),Font=new Font("Segoe UI",bold?18:10,bold?FontStyle.Bold:FontStyle.Regular)});
        }
        private string SourceFolder() {
            string folderPath=Path.GetFullPath(source.Text);
            if(!File.Exists(Path.Combine(folderPath,"manifest.json")) && String.Equals(Path.GetFileName(folderPath.TrimEnd(Path.DirectorySeparatorChar)),"data",StringComparison.OrdinalIgnoreCase)) {
                string parent=Path.GetDirectoryName(folderPath);if(File.Exists(Path.Combine(parent,"manifest.json")))folderPath=parent;
            }
            return folderPath;
        }
        private string JobsParent() {return Path.Combine(Path.GetDirectoryName(SourceFolder()),"restauracoes");}
        private void SelectSourceTarget() {
            try {
                var manifest=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(SourceFolder(),"manifest.json")));
                var archive=(Dictionary<string,object>)manifest["archive"];string id=Convert.ToString(archive["id"]);
                for(int i=0;i<targets.Items.Count;i++)if(((RestoreTarget)targets.Items[i]).Id==id){targets.SelectedIndex=i;return;}
            }catch{}
        }
        private void EnableInputs() {
            source.Enabled=browse.Enabled=targets.Enabled=list.Enabled=!RequiresRestart;
            begin.Enabled=!RequiresRestart && targets.SelectedItem!=null;cancel.Enabled=false;
        }
        private void Start(string next) {
            if(worker!=null || RequiresRestart)return;
            try {
                var target=targets.SelectedItem as RestoreTarget;
                if(next!="list" && target==null)throw new Exception("Leia os destinos do console e escolha o jogo e usuário.");
                string tool="painel-restore.cjs",arguments=Checks.QuoteArgument(session)+" "+next+" "+Checks.QuoteArgument(SourceFolder());
                if(next=="list") {
                    cancelling=false;targets.Items.Clear();tool="painel-saves.cjs";
                    arguments=Checks.QuoteArgument(session)+" list "+Checks.QuoteArgument(PanelSettings.Destination("saves",Path.Combine(root,"saves-backups")));
                } else if(next=="inspect"){cancelling=false;folder=null;}
                else if(next=="prepare") {
                    string encoded=Convert.ToBase64String(Encoding.UTF8.GetBytes(json.Serialize(selected)));
                    arguments+=" "+Checks.QuoteArgument(JobsParent())+" "+encoded+" allow-edited "+target.Id;
                } else if(next=="apply")arguments=Checks.QuoteArgument(session)+" apply "+Checks.QuoteArgument(planPath)+" "+planHash+" --confirm-restore";
                worker=new Runner();worker.Start(Checks.FindNode(root),Path.Combine(root,tool),arguments,root);
                action=next;received=failed=writing=false;
                source.Enabled=browse.Enabled=targets.Enabled=list.Enabled=begin.Enabled=false;cancel.Enabled=true;
                if(next=="inspect" || next=="list")output.Clear();
                status.Text=next=="list"?"Lendo jogos e usuários do console...":next=="inspect"?"Conferindo os arquivos selecionados...":next=="prepare"?"Criando o pré-backup do console...":"Conferindo o plano e o estado atual do console...";
                bar.Style=ProgressBarStyle.Marquee;
            }catch(Exception error){if(worker!=null)worker.Dispose();worker=null;EnableInputs();MessageBox.Show(this,error.Message,"Restaurar save");}
        }
        private void ReadOutput() {
            foreach(string line in worker.Drain()) {
                output.AppendText(line+Environment.NewLine);if(!line.StartsWith("PANEL:"))continue;
                try {
                    var value=json.Deserialize<Dictionary<string,object>>(line.Substring(6));string kind=Convert.ToString(value["kind"]);
                    if(kind=="saves") {
                        foreach(var raw in (System.Collections.IEnumerable)value["saves"]) {
                            var save=(Dictionary<string,object>)raw;
                            targets.Items.Add(new RestoreTarget {Id=Convert.ToString(save["id"]),Title=Convert.ToString(save["title"]),User=Convert.ToString(save["uid"]),Name=Convert.ToString(save["name"])});
                        }
                        if(targets.Items.Count>0)targets.SelectedIndex=0;SelectSourceTarget();
                    } else if(kind=="listed")received=true;
                    else if(kind=="inspection") {
                        var archive=(Dictionary<string,object>)value["archive"];var target=(RestoreTarget)targets.SelectedItem;
                        if(Convert.ToString(archive["id"])!=target.Id || Convert.ToString(archive["title"])!=target.Title || Convert.ToString(archive["uid"])!=target.User)
                            throw new Exception("A pasta pertence a outro jogo ou usuário. Escolha o destino correspondente ao backup.");
                        selected=new List<string>();var all=new List<string>();
                        foreach(var raw in (System.Collections.IEnumerable)value["files"]) {
                            var file=(Dictionary<string,object>)raw;string name=Convert.ToString(file["path"]);all.Add(name);
                            if(Convert.ToBoolean(file["edited"]))selected.Add(name);
                        }
                        if(selected.Count==0)selected=all;received=true;
                    } else if(kind=="prepared") {
                        planPath=Convert.ToString(value["planPath"]);planHash=Convert.ToString(value["planSha256"]);
                        var names=new List<string>();foreach(var raw in (System.Collections.IEnumerable)value["files"]) {
                            var file=(Dictionary<string,object>)raw;names.Add(Convert.ToString(file["path"])+(Convert.ToBoolean(file["edited"])?" (editado)":""));
                        }
                        string uid=Convert.ToString(value["uid"]);uid=uid.Trim('0').Length==0?"compartilhado":uid.Substring(0,16);
                        confirmation="Jogo: "+Convert.ToString(value["name"])+" ["+Convert.ToString(value["title"]).ToUpperInvariant()+"]\nUsuário: "+uid+
                            "\n\nArquivos que serão substituídos:\n"+String.Join("\n",names.ToArray())+"\n\nPré-backup verificado:\n"+Convert.ToString(value["backupFolder"])+"\n\nConfirma a gravação no console?";
                        received=true;
                    } else if(kind=="destination")folder=Convert.ToString(value["path"]);
                    else if(kind=="status" || kind=="writing") {
                        status.Text=Convert.ToString(value["message"]);if(kind=="writing"){writing=true;cancel.Enabled=false;}
                    } else if(kind=="transfer")status.Text="Pré-backup: "+Convert.ToDouble(value["done"]).ToString("N0")+" / "+Convert.ToDouble(value["total"]).ToString("N0")+" bytes";
                    else if(kind=="complete")received=true;
                    else if(kind=="error"){failed=true;RequiresRestart=!value.ContainsKey("requiresRestart")||Convert.ToBoolean(value["requiresRestart"]);status.Text=Convert.ToString(value["summary"]);}
                }catch(Exception error){failed=true;if(action!="inspect")RequiresRestart=true;status.Text=error.Message;}
            }
        }
        private void Poll(object sender,EventArgs args) {
            if(worker==null)return;ReadOutput();if(!worker.Complete)return;ReadOutput();
            string finished=action;bool success=worker.ExitCode==0 && received && !failed;
            if(!success && !failed){status.Text="Operação incompleta. Confira os registros.";RequiresRestart=action!="inspect";}
            try {File.WriteAllText(Path.Combine(folder??session,"painel-restore-"+DateTime.Now.ToString("yyyyMMdd-HHmmss-fff")+".log"),worker.Transcript);}catch{}
            worker.Dispose();worker=null;writing=false;
            if(success && !cancelling && finished=="inspect"){Start("prepare");return;}
            if(success && !cancelling && finished=="prepare") {
                status.Text="Pré-backup concluído. Aguardando confirmação.";
                if(MessageBox.Show(this,confirmation,"Confirmar restauração",MessageBoxButtons.YesNo,MessageBoxIcon.Warning,MessageBoxDefaultButton.Button2)==DialogResult.Yes){Start("apply");return;}
                cancelling=true;
            }
            EnableInputs();bar.Style=ProgressBarStyle.Continuous;bar.Value=success?1000:0;
            if(success)status.Text=finished=="apply"?"Save restaurado • commit, releitura e limpeza confirmados. Teste o jogo.":cancelling?"Operação encerrada sem gravar o save. O pré-backup foi preservado.":"Destinos lidos. Escolha a pasta e o jogo para restaurar.";
            if(RequiresRestart)status.Text+=" Encerre a conexão e reinicie o console.";
            planPath=planHash=null;
        }
    }
}
