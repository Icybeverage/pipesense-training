using System;
using UnityEngine;

namespace PipeSense
{
    [Serializable]
    public struct PipeAttempt
    {
        public int attemptNumber;
        public float leftGap;
        public float rightGap;
        public float verticalError;
        public float elapsedSeconds;
        public bool actionOrderValid;
    }

    [Serializable]
    public struct PipeScore
    {
        public float total;
        public float alignment;
        public float sequence;
        public bool connected;
        public string primaryIssue;
    }

    public static class PipeScorer
    {
        public static PipeScore Evaluate(PipeAttempt attempt)
        {
            var gapError = Mathf.Max(0f, attempt.leftGap) + Mathf.Max(0f, attempt.rightGap);
            var geometryError = gapError + Mathf.Abs(attempt.verticalError) * 1.5f;
            var alignment = Mathf.Clamp01(1f - geometryError / 3f) * 80f;
            var sequence = attempt.actionOrderValid ? 20f : 0f;
            var connected = attempt.leftGap <= 0.22f && attempt.rightGap <= 0.22f &&
                            Mathf.Abs(attempt.verticalError) <= 0.18f && attempt.actionOrderValid;

            string issue;
            if (!attempt.actionOrderValid) issue = "sequence";
            else if (Mathf.Abs(attempt.verticalError) > 0.18f) issue = "height_alignment";
            else if (attempt.leftGap + attempt.rightGap > 0.44f) issue = "connection_gap";
            else issue = "none";

            return new PipeScore
            {
                total = connected ? 100f : Mathf.Min(99f, alignment + sequence),
                alignment = alignment,
                sequence = sequence,
                connected = connected,
                primaryIssue = issue
            };
        }
    }
}

