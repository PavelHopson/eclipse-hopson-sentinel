// GUI-subsystem host: no visible console and no hidden PowerShell wrapper.
// Ollama 0.32.15 GPU discovery omits CREATE_NO_WINDOW. Give its entire tree
// an existing headless console so short-lived discovery tools inherit it.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;

internal static class UltronOllamaHost {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long processTime,jobTime; public uint flags; public UIntPtr min,max;
        public uint active; public UIntPtr affinity; public uint priority,scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct Limits { public BasicLimits basic; public Io io; public UIntPtr process,job,peakProcess,peakJob; }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int kind,ref Limits limits,uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    static string Quote(string value) {
        // Only a validated absolute executable path, never user/model text.
        return "\"" + value + "\"";
    }

    static int Main(string[] args) {
        IntPtr job = IntPtr.Zero;
        try {
            if (args.Length != 1 || args[0].IndexOf('"') >= 0 || args[0].IndexOf('\0') >= 0 ||
                !Path.IsPathRooted(args[0]) || args[0].StartsWith("\\\\") ||
                !Path.GetFileName(args[0]).Equals("ollama.exe", StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(args[0])) return 64;
            string endpoint = Environment.GetEnvironmentVariable("OLLAMA_HOST");
            if (endpoint != "127.0.0.1:11434" && endpoint != "127.0.0.1:11435" && endpoint != "127.0.0.1:11436") return 64;
            string models = Environment.GetEnvironmentVariable("OLLAMA_MODELS");
            if (String.IsNullOrEmpty(models) || !Path.IsPathRooted(models) || models.StartsWith("\\\\") || !Directory.Exists(models)) return 64;
            string conhost = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "conhost.exe");
            job = CreateJobObject(IntPtr.Zero, null);
            var limits = new Limits(); limits.basic.flags = 0x2000; // KILL_ON_JOB_CLOSE, owned processes only.
            if (job == IntPtr.Zero || !SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) return 70;
            using (var child = new Process()) {
                child.StartInfo = new ProcessStartInfo {
                    FileName = conhost,
                    Arguments = "--headless " + Quote(Path.GetFullPath(args[0])) + " serve",
                    WorkingDirectory = Path.GetDirectoryName(Path.GetFullPath(args[0])),
                    UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                };
                if (!child.Start()) return 70;
                if (!AssignProcessToJobObject(job, child.Handle)) { child.Kill(); return 70; }
                // Drain, never accumulate or log prompts, environment or response text.
                // Keep stdin open for the lifetime of this service, independent of UI.
                Task stdout = child.StandardOutput.BaseStream.CopyToAsync(Stream.Null);
                Task stderr = child.StandardError.BaseStream.CopyToAsync(Stream.Null);
                child.WaitForExit();
                Task.WaitAll(stdout, stderr);
                return child.ExitCode;
            }
        } catch {
            // No MessageBox / error console / retry loop. The UI reports probe failure.
            return 70;
        } finally {
            if (job != IntPtr.Zero) CloseHandle(job);
        }
    }
}
