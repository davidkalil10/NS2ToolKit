namespace NS2Panel {
    using System;
    using System.Collections.Generic;
    using System.Diagnostics;
    using System.Drawing;
    using System.IO;
    using System.Web.Script.Serialization;
    using System.Windows.Forms;
    public sealed class FtpWindow : Form {
        private readonly string root,session;
        private readonly bool autoOpen;
        private readonly Button toggle=new Button(),explorer=new Button(),copy=new Button(),pickBackup=new Button(),openBackups=new Button();
        private readonly CheckBox upload=new CheckBox(),browse=new CheckBox(),overwrite=new CheckBox();
        private readonly TextBox address=new TextBox(),output=new TextBox(),backupFolder=new TextBox();
        private readonly Label status=new Label(),scope=new Label();
        private readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
        private readonly JavaScriptSerializer json=new JavaScriptSerializer();
        private Runner worker;
        private bool stopping,failed,complete,critical,closeRequested;
        private string lastBackupFolder;
        public bool RequiresRestart {get;private set;}
        public FtpWindow(string folder,string run):this(folder,run,true){}
        public FtpWindow(string folder,string run,bool openAutomatically) {
            root=folder;session=run;autoOpen=openAutomatically;Text="NS2 • Arquivos / FTP";ClientSize=new Size(865,620);
            FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterParent;
            Font=new Font("Segoe UI",10);BackColor=Color.FromArgb(245,247,251);
            Controls.Add(new Label {Text="Arquivos do console",Font=new Font("Segoe UI",18,FontStyle.Bold),Location=new Point(22,18),Size=new Size(820,35)});
            Controls.Add(new Label {Text="Monte o FTP para navegar pelo Explorer. Desmonte antes de usar os outros módulos.",Location=new Point(22,65),Size=new Size(820,28)});
            browse.Text="Mostrar jogos e saves por nome (somente leitura)";browse.Checked=true;browse.SetBounds(22,102,820,27);Controls.Add(browse);
            upload.Text="Permitir arquivos e pastas novos no SD";upload.SetBounds(22,137,820,27);Controls.Add(upload);
            overwrite.Text="Permitir substituir arquivos no SD (backup automático no PC)";overwrite.SetBounds(22,172,820,27);Controls.Add(overwrite);
            Controls.Add(new Label {Text="Cópias anteriores no PC",Location=new Point(22,212),Size=new Size(820,24)});
            backupFolder.Text=PanelSettings.Destination("ftp",Path.Combine(PanelSettings.Destination("games",Path.Combine(root,"backups")),"ftp-originals"));backupFolder.SetBounds(22,240,653,28);Controls.Add(backupFolder);
            pickBackup.Text="Escolher pasta";pickBackup.SetBounds(685,238,157,32);pickBackup.Click+=delegate {using(var picker=new FolderBrowserDialog()){picker.Description="Pasta das cópias anteriores do FTP";if(Directory.Exists(backupFolder.Text))picker.SelectedPath=backupFolder.Text;if(picker.ShowDialog(this)==DialogResult.OK)backupFolder.Text=picker.SelectedPath;}};Controls.Add(pickBackup);
            upload.CheckedChanged+=delegate {if(!upload.Checked)overwrite.Checked=false;SetOptions();};overwrite.CheckedChanged+=delegate {SetOptions();};
            scope.Text="Jogos, saves, Interno e a pasta Nintendo do SD são somente leitura.";scope.SetBounds(22,284,820,45);Controls.Add(scope);
            address.ReadOnly=true;address.SetBounds(22,342,820,28);address.Text="FTP desmontado";Controls.Add(address);
            toggle.Text="Montar FTP";toggle.SetBounds(22,386,180,35);toggle.Click+=delegate {if(worker==null)Mount();else Unmount();};Controls.Add(toggle);
            explorer.Text="Abrir no Explorer";explorer.SetBounds(212,386,190,35);explorer.Enabled=false;explorer.Click+=delegate {OpenExplorer();};Controls.Add(explorer);
            copy.Text="Copiar endereço";copy.SetBounds(412,386,170,35);copy.Enabled=false;copy.Click+=delegate {try{Clipboard.SetText(address.Text);}catch(Exception error){status.Text=error.Message;}};Controls.Add(copy);
            openBackups.Text="Ver cópias anteriores";openBackups.SetBounds(592,386,250,35);openBackups.Click+=delegate {try{string target=lastBackupFolder??Path.GetFullPath(backupFolder.Text);Directory.CreateDirectory(target);Process.Start(new ProcessStartInfo("explorer.exe",Checks.QuoteArgument(target)){UseShellExecute=true});}catch(Exception error){status.Text=error.Message;}};Controls.Add(openBackups);
            status.Text="Substituição no SD: até 1 GiB por arquivo, com cópia anterior e verificação.";status.SetBounds(22,440,820,43);Controls.Add(status);
            output.SetBounds(22,493,820,102);output.Multiline=true;output.ReadOnly=true;output.WordWrap=false;output.ScrollBars=ScrollBars.Both;output.Font=new Font("Consolas",9);Controls.Add(output);
            SetOptions();
            timer.Interval=200;timer.Tick+=Poll;timer.Start();
            FormClosing+=delegate(object sender,FormClosingEventArgs args){if(worker!=null){args.Cancel=true;closeRequested=true;if(!critical)Unmount();else status.Text="Aguarde a gravação e a verificação do arquivo antes de fechar.";return;}timer.Stop();};
        }
        private bool ValidAddress() {Uri uri;return Uri.TryCreate(address.Text,UriKind.Absolute,out uri)&&uri.Scheme=="ftp"&&uri.Host=="127.0.0.1"&&uri.Port>0;}
        private void SetOptions(){bool enabled=worker==null&&!RequiresRestart;upload.Enabled=browse.Enabled=enabled;overwrite.Enabled=enabled&&upload.Checked;backupFolder.Enabled=pickBackup.Enabled=enabled&&overwrite.Checked;openBackups.Enabled=!critical&&(overwrite.Checked||lastBackupFolder!=null);}
        private void OpenExplorer() {
            if(!ValidAddress()||stopping)return;
            try{Process.Start(new ProcessStartInfo("explorer.exe",Checks.QuoteArgument(address.Text)){UseShellExecute=true});}
            catch(Exception error){status.Text="FTP ativo. Use Copiar endereço em um cliente FTP. "+error.Message;}
        }
        private void Mount() {
            if(RequiresRestart)return;
            try{
                string mode=overwrite.Checked?"sd-overwrite":upload.Checked?"sd-new-files":"read-only";
                string arguments=Checks.QuoteArgument(session)+" "+mode+" "+(browse.Checked?"catalog":"storage");
                if(overwrite.Checked){string backupPath=Path.GetFullPath(backupFolder.Text);PanelSettings.SaveDestination("ftp",backupPath);arguments+=" "+Checks.QuoteArgument(backupPath);}
                worker=new Runner();worker.Start(Checks.FindNode(root),Path.Combine(root,"painel-ftp.cjs"),arguments,root);
                stopping=failed=complete=critical=closeRequested=false;output.Clear();SetOptions();
                toggle.Text="Desmontar FTP";status.Text="Montando os armazenamentos disponíveis...";address.Text="Abrindo FTP local...";
            }catch(Exception error){if(worker!=null)worker.Dispose();worker=null;status.Text=error.Message;SetOptions();toggle.Text="Montar FTP";}
        }
        private void Unmount() {
            if(worker==null||stopping||critical)return;stopping=true;toggle.Enabled=explorer.Enabled=copy.Enabled=false;
            status.Text="Desmontando FTP. Aguardando as operações e a limpeza...";worker.RequestCleanup();
        }
        private void ReadOutput() {
            foreach(string line in worker.Drain()) {
                output.AppendText(line+Environment.NewLine);if(!line.StartsWith("PANEL:"))continue;
                try{
                    var value=json.Deserialize<Dictionary<string,object>>(line.Substring(6));string kind=Convert.ToString(value["kind"]);
                    if(kind=="ftp_ready") {
                        address.Text=Convert.ToString(value["url"]);if(!ValidAddress())throw new Exception("O FTP não retornou um endereço local válido.");
                        var roots=new List<string>();foreach(object name in (System.Collections.IEnumerable)value["scopes"])roots.Add(Convert.ToString(name));
                        scope.Text="Disponível: "+String.Join(", ",roots.ToArray())+". SD: "+(overwrite.Checked?"substituição com backup.":upload.Checked?"novos arquivos.":"leitura.")+" Jogos, saves, Interno e Nintendo: somente leitura.";
                        foreach(var item in (System.Collections.IEnumerable)value["unavailable"]){var missing=(Dictionary<string,object>)item;scope.Text+=" "+Convert.ToString(missing["name"])+" não abriu.";}
                        if(!stopping){explorer.Enabled=copy.Enabled=true;status.Text="FTP montado. Navegue e copie arquivos; desmonte ao terminar.";if(autoOpen)OpenExplorer();}
                    }else if(kind=="status"&&!stopping)status.Text=Convert.ToString(value["message"]);
                    else if(kind=="phase"&&Convert.ToString(value["phase"])=="ftp_cleanup")status.Text=Convert.ToString(value["operation"]);
                    else if(kind=="backup_ready"){lastBackupFolder=Convert.ToString(value["path"]);status.Text="Cópia anterior conferida no PC.";}
                    else if(kind=="writing"){critical=true;toggle.Enabled=openBackups.Enabled=false;status.Text=Convert.ToString(value["message"]);}
                    else if(kind=="write_finished"){critical=false;SetOptions();if(!stopping){toggle.Enabled=true;status.Text=Convert.ToBoolean(value["complete"])?"Arquivo gravado e verificado no SD.":"Envio não concluído. Confira os registros e a cópia anterior.";}if(closeRequested)Unmount();}
                    else if(kind=="transfer"&&!stopping)status.Text=(Convert.ToString(value["direction"])=="upload"?"Enviando ao SD: ":"Lendo do console: ")+Convert.ToDouble(value["done"]).ToString("N0")+" / "+Convert.ToDouble(value["total"]).ToString("N0")+" bytes • "+Convert.ToString(value["file"]);
                    else if(kind=="complete")complete=true;
                    else if(kind=="error"){failed=true;RequiresRestart=!value.ContainsKey("requiresRestart")||Convert.ToBoolean(value["requiresRestart"]);status.Text=Convert.ToString(value["summary"]);}
                }catch(Exception error){failed=true;RequiresRestart=true;status.Text=error.Message;if(!critical)Unmount();}
            }
        }
        private void Poll(object sender,EventArgs args) {
            if(worker==null)return;ReadOutput();if(!worker.Complete)return;ReadOutput();
            bool success=worker.ExitCode==0&&complete&&!failed;
            if(!success&&!failed){RequiresRestart=true;status.Text="FTP terminou sem confirmar a limpeza.";}
            if(success)status.Text="FTP desmontado. A conexão está disponível para os outros módulos.";
            try{File.WriteAllText(Path.Combine(session,"painel-ftp-"+DateTime.Now.ToString("yyyyMMdd-HHmmss-fff")+".log"),worker.Transcript);}catch{}
            worker.Dispose();worker=null;stopping=critical=false;toggle.Text="Montar FTP";toggle.Enabled=!RequiresRestart;SetOptions();
            explorer.Enabled=copy.Enabled=false;address.Text="FTP desmontado";
            if(RequiresRestart)status.Text+=" Encerre a conexão e reinicie o console.";
            if(closeRequested)Close();
        }
    }
}
