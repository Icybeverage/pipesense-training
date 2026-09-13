using System;

namespace PipeSense.Core
{
    /// <summary>
    /// Deterministic geometry measurements for one attempt. All values are produced by
    /// Unity-side measurement code (AlignmentMath + session tracking), never by an LLM.
    /// Sign conventions: deltas are right-minus-left; +Z points toward the viewer.
    /// </summary>
    [Serializable]
    public struct AttemptMetrics
    {
        public double GapM;
        public double RadialOffsetM;
        public double AngularErrorDeg;
        public double HeightDeltaM;
        public double DepthDeltaM;
        public double YawErrorLeftDeg;
        public double PitchErrorLeftDeg;
        public double YawErrorRightDeg;
        public double PitchErrorRightDeg;
        public double DurationSeconds;
        public double JitterMps;
        public bool LeftTracked;
        public bool RightTracked;
        public bool LeftGripClosed;
        public bool RightGripClosed;
    }

    public readonly struct ScoreComponents
    {
        public readonly double AlignmentPoints;
        public readonly double AnglePoints;
        public readonly double GapPoints;
        public readonly double TimePoints;
        public readonly double SteadinessPoints;

        public ScoreComponents(double alignment, double angle, double gap, double time, double steadiness)
        {
            AlignmentPoints = alignment;
            AnglePoints = angle;
            GapPoints = gap;
            TimePoints = time;
            SteadinessPoints = steadiness;
        }

        public double Total => AlignmentPoints + AnglePoints + GapPoints + TimePoints + SteadinessPoints;

        public static ScoreComponents Zero => new ScoreComponents(0, 0, 0, 0, 0);
    }

    public readonly struct EvaluationVerdict
    {
        public readonly bool Connected;
        public readonly bool Overlap;
        public readonly double ScoreValue;
        public readonly string DominantError;
        public readonly string Correction;
        public readonly ScoreComponents Components;

        public EvaluationVerdict(bool connected, bool overlap, double scoreValue, string dominantError, string correction, ScoreComponents components)
        {
            Connected = connected;
            Overlap = overlap;
            ScoreValue = scoreValue;
            DominantError = dominantError;
            Correction = correction;
            Components = components;
        }
    }
}
