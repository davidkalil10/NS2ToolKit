namespace NS2Panel {
    using System;
    using System.Windows.Forms;

    public static class Entry {
        [STAThread]
        public static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try {Application.Run(new MainWindow(AppDomain.CurrentDomain.BaseDirectory));}
            catch (Exception error) {MessageBox.Show(error.Message, "NS2 • Assistente de conexão");}
        }
    }
}
