using System.Diagnostics;
using UnityEngine;

namespace PipeSense
{
    public sealed class VoiceNarrator
    {
        public bool Enabled { get; set; } = true;
        public string LastCaption { get; private set; } = string.Empty;

        public void Speak(string caption)
        {
            LastCaption = caption ?? string.Empty;
            if (!Enabled || string.IsNullOrWhiteSpace(LastCaption)) return;
#if UNITY_EDITOR_OSX || UNITY_STANDALONE_OSX
            try
            {
                var info = new ProcessStartInfo
                {
                    FileName = "/usr/bin/say",
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                info.ArgumentList.Add("-v");
                info.ArgumentList.Add("Samantha");
                info.ArgumentList.Add(LastCaption);
                Process.Start(info);
            }
            catch (System.Exception error)
            {
                UnityEngine.Debug.LogWarning($"Voice unavailable; captions remain active. {error.Message}");
            }
#endif
        }
    }
}

