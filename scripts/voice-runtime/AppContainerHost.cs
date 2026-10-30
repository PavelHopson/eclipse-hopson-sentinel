// Windows-only, dependency-free launcher. Never exposed to renderer IPC.
// No network capabilities; only three explicit pipe handles are inherited.
// The job closes on host exit and kills all owned children, including venv launchers.
using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

internal static class AppContainerHost
{
    const string Name = "Eclipse.Ultron.Voice.Offline.v1";
    static string Stage = "init";
    [StructLayout(LayoutKind.Sequential)] struct Capabilities { public IntPtr Sid, Values; public uint Count, Reserved; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
        public int cb; public string reserved, desktop, title;
        public uint x, y, width, height, xChars, yChars, fill, flags;
        public short show, reservedSize; public IntPtr reservedPtr, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)] struct StartupEx { public Startup Info; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process, Thread; public uint Id, ThreadId; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong A, B, C, D, E, F; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob;
    }
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr capabilities, uint count, out IntPtr sid);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
    [DllImport("userenv.dll", CharSet = CharSet.Unicode)] static extern int GetAppContainerFolderPath(string sid, out IntPtr path);
    [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcess(string application, StringBuilder command, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr environment, string directory, ref StartupEx startup, out ProcessInfo info);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle, uint timeout);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static string Quote(string value) {
        if (value.IndexOf('\0') >= 0) throw new ArgumentException();
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes); slashes = 0; result.Append(c);
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }
    static string ProfilePath(IntPtr sid) {
        IntPtr pointer;
        Marshal.ThrowExceptionForHR(GetAppContainerFolderPath(new SecurityIdentifier(sid).Value, out pointer));
        try { return Marshal.PtrToStringUni(pointer); } finally { Marshal.FreeCoTaskMem(pointer); }
    }
    static bool IsMissingProfile(Exception error) {
        if (error is FileNotFoundException || error is DirectoryNotFoundException) return true;
        var external = error as ExternalException;
        return external != null && (external.ErrorCode == unchecked((int)0x80070002) || external.ErrorCode == unchecked((int)0x80070003));
    }
    static void PrepareProfile(out IntPtr sid) {
        sid = IntPtr.Zero;
        Stage = "create-profile";
        int hr = CreateAppContainerProfile(Name, "Ultron offline voice", "Local synthesis without network capabilities", IntPtr.Zero, 0, out sid);
        if (hr == unchecked((int)0x80070002) || hr == unchecked((int)0x80070003)) {
            // Windows can leave a partial package-directory/profile mapping.
            // Ask userenv to remove only this fixed registration, then recreate.
            Stage = "delete-incomplete-profile";
            int deleteHr = DeleteAppContainerProfile(Name);
            if (deleteHr != 0 && deleteHr != unchecked((int)0x80070002) && deleteHr != unchecked((int)0x80070003))
                Marshal.ThrowExceptionForHR(deleteHr);
            Stage = "recreate-incomplete-profile";
            hr = CreateAppContainerProfile(Name, "Ultron offline voice", "Local synthesis without network capabilities", IntPtr.Zero, 0, out sid);
        }
        if (hr == unchecked((int)0x800700b7)) {
            Stage = "derive-profile";
            Marshal.ThrowExceptionForHR(DeriveAppContainerSidFromAppContainerName(Name, out sid));
            try {
                Stage = "profile-path-existing";
                Directory.CreateDirectory(Path.Combine(ProfilePath(sid), "Temp"));
                return;
            } catch (Exception error) {
                if (!IsMissingProfile(error)) throw;
                FreeSid(sid); sid = IntPtr.Zero;
                // The profile registration can outlive its disposable folder
                // after Windows storage cleanup. Repair only this fixed,
                // capability-free profile and never broaden its permissions.
                Stage = "delete-stale-profile";
                Marshal.ThrowExceptionForHR(DeleteAppContainerProfile(Name));
                Stage = "recreate-profile";
                Marshal.ThrowExceptionForHR(CreateAppContainerProfile(Name, "Ultron offline voice", "Local synthesis without network capabilities", IntPtr.Zero, 0, out sid));
            }
        } else {
            Marshal.ThrowExceptionForHR(hr);
        }
        Stage = "profile-path-created";
        Directory.CreateDirectory(Path.Combine(ProfilePath(sid), "Temp"));
    }
    static IntPtr EnvironmentBlock(string profile) {
        // Independent allowlist: the launcher also strips host credentials and proxy settings.
        var env = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        env["SYSTEMROOT"] = windows; env["WINDIR"] = windows;
        env["TEMP"] = Path.Combine(profile, "Temp"); env["TMP"] = env["TEMP"];
        env["LOCALAPPDATA"] = profile; env["USERNAME"] = "ultron-tts";
        env["NUMBA_CACHE_DIR"] = Path.Combine(profile, "Temp", "numba");
        env["HF_HUB_OFFLINE"] = "1"; env["TRANSFORMERS_OFFLINE"] = "1";
        env["HF_HUB_DISABLE_TELEMETRY"] = "1"; env["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1";
        env["DO_NOT_TRACK"] = "1"; env["TOKENIZERS_PARALLELISM"] = "false";
        env["CUDA_VISIBLE_DEVICES"] = ""; env["OMP_NUM_THREADS"] = "4";
        var block = new StringBuilder();
        foreach (var pair in env) block.Append(pair.Key).Append('=').Append(pair.Value).Append('\0');
        block.Append('\0'); return Marshal.StringToHGlobalUni(block.ToString());
    }
    static int Run(string[] args, IntPtr sid) {
        Stage = "validate-application";
        if (args.Length < 1 || !Path.IsPathRooted(args[0]) || !File.Exists(args[0])) throw new ArgumentException();
        IntPtr attributes = IntPtr.Zero, caps = IntPtr.Zero, handles = IntPtr.Zero, env = IntPtr.Zero, job = IntPtr.Zero;
        var inherited = new List<IntPtr>(); var pi = new ProcessInfo(); bool launched = false, completed = false;
        try {
            Stage = "attribute-list";
            IntPtr size = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
            attributes = Marshal.AllocHGlobal(size); Check(InitializeProcThreadAttributeList(attributes, 2, 0, ref size));
            var capability = new Capabilities { Sid = sid, Values = IntPtr.Zero, Count = 0, Reserved = 0 };
            caps = Marshal.AllocHGlobal(Marshal.SizeOf(capability)); Marshal.StructureToPtr(capability, caps, false);
            Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20009), caps, new IntPtr(Marshal.SizeOf(capability)), IntPtr.Zero, IntPtr.Zero));
            Stage = "duplicate-handles";
            foreach (int std in new [] { -10, -11, -12 }) {
                IntPtr duplicate; Check(DuplicateHandle(GetCurrentProcess(), GetStdHandle(std), GetCurrentProcess(), out duplicate, 0, true, 2));
                inherited.Add(duplicate);
            }
            handles = Marshal.AllocHGlobal(IntPtr.Size * 3); Marshal.Copy(inherited.ToArray(), 0, handles, 3);
            Check(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
            Stage = "job-object";
            job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero);
            var limits = new ExtendedLimits();
            // KILL_ON_JOB_CLOSE | ACTIVE_PROCESS | JOB_MEMORY. No breakaway.
            limits.Basic.Flags = 0x2000 | 0x8 | 0x200;
            limits.Basic.ActiveProcesses = 2; // venv launcher + actual interpreter
            limits.JobMemory = new UIntPtr(8UL * 1024 * 1024 * 1024);
            Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)));
            Stage = "profile-path-run";
            string profile = ProfilePath(sid);
            env = EnvironmentBlock(profile);
            var startup = new StartupEx(); startup.Info.cb = Marshal.SizeOf(startup); startup.Attributes = attributes;
            startup.Info.flags = 0x100; startup.Info.input = inherited[0]; startup.Info.output = inherited[1]; startup.Info.error = inherited[2];
            var command = new StringBuilder(); foreach (string arg in args) command.Append(Quote(arg)).Append(' ');
            // Suspend until the job owns the process: no unsandboxed/unowned race window.
            Stage = "create-process";
            Check(CreateProcess(args[0], command, IntPtr.Zero, IntPtr.Zero, true, 0x80000 | 0x400 | 0x8000000 | 0x4, env, profile, ref startup, out pi));
            launched = true; Check(AssignProcessToJobObject(job, pi.Process));
            Check(ResumeThread(pi.Thread) != 0xffffffff);
            uint wait = WaitForSingleObject(pi.Process, 360000);
            if (wait != 0) throw new TimeoutException();
            uint exit; Check(GetExitCodeProcess(pi.Process, out exit)); completed = true;
            return unchecked((int)exit);
        } finally {
            if (launched && !completed) TerminateProcess(pi.Process, 125);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (pi.Thread != IntPtr.Zero) CloseHandle(pi.Thread);
            if (pi.Process != IntPtr.Zero) CloseHandle(pi.Process);
            foreach (IntPtr handle in inherited) CloseHandle(handle);
            if (attributes != IntPtr.Zero) { DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); }
            if (caps != IntPtr.Zero) Marshal.FreeHGlobal(caps);
            if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
            if (env != IntPtr.Zero) Marshal.FreeHGlobal(env);
        }
    }
    static int Main(string[] args) {
        IntPtr sid = IntPtr.Zero;
        try {
            if (args.Length == 1 && args[0] == "--prepare") {
                PrepareProfile(out sid);
                Console.WriteLine(new SecurityIdentifier(sid).Value); return 0;
            }
            Marshal.ThrowExceptionForHR(DeriveAppContainerSidFromAppContainerName(Name, out sid));
            return Run(args, sid);
        } catch (Exception error) {
            // No command, text, paths or environment in diagnostics.
            var native = error as Win32Exception;
            Console.Error.WriteLine("sandbox-failed:" + Stage + ":" + (native == null ? error.GetType().Name : native.NativeErrorCode.ToString()));
            return 125;
        } finally { if (sid != IntPtr.Zero) FreeSid(sid); }
    }
}
