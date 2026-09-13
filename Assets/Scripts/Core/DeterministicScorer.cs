using System;

namespace PipeSense.Core
{
    /// <summary>
    /// Deterministic, explainable scoring. This is the source of truth for whether a
    /// connection is valid; the backend mirrors it for language generation and parity checks.
    /// </summary>
    public static class DeterministicScorer
    {
        public static EvaluationVerdict Evaluate(AttemptMetrics m)
        {
            bool trackingOk = m.LeftTracked && m.RightTracked;
            bool gripOk = m.LeftGripClosed && m.RightGripClosed;
            bool overlap = m.GapM < ScoringTolerances.OverlapM;
            bool radialOk = m.RadialOffsetM <= ScoringTolerances.RadialM;
            bool angleOk = m.AngularErrorDeg <= ScoringTolerances.AngleDeg;
            bool gapOk = Math.Abs(m.GapM) <= ScoringTolerances.GapM && !overlap;

            if (!trackingOk)
            {
                return Failed(m, overlap, Diagnostics.Tracking, Diagnostics.NoTracking);
            }

            if (!gripOk)
            {
                return Failed(m, overlap, Diagnostics.Grip, Diagnostics.RegripBoth);
            }

            if (radialOk && angleOk && gapOk)
            {
                ScoreComponents components = ComputeComponents(m);
                double value = Math.Round(components.Total, 1, MidpointRounding.AwayFromZero);
                string correction = AdvisoryCorrection(components);
                return new EvaluationVerdict(true, overlap, value, Diagnostics.None, correction, components);
            }

            string dominant = DominantGate(m);
            string correctionCode = CorrectionFor(m, dominant);
            return Failed(m, overlap, dominant, correctionCode);
        }

        public static ScoreComponents ComputeComponents(AttemptMetrics m)
        {
            double alignment = ScoringTolerances.AlignmentWeight * (1.0 - Clamp01(m.RadialOffsetM / ScoringTolerances.RadialM));
            double angle = ScoringTolerances.AngleWeight * (1.0 - Clamp01(m.AngularErrorDeg / ScoringTolerances.AngleDeg));
            double gap = ScoringTolerances.GapWeight * (1.0 - Clamp01(Math.Abs(m.GapM) / ScoringTolerances.GapM));
            double time = ScoringTolerances.TimeWeight * (1.0 - Clamp01((m.DurationSeconds - ScoringTolerances.TargetSeconds) / (ScoringTolerances.MaxSeconds - ScoringTolerances.TargetSeconds)));
            double steadiness = ScoringTolerances.SteadinessWeight * (1.0 - Clamp01(m.JitterMps / ScoringTolerances.JitterMps));
            return new ScoreComponents(alignment, angle, gap, time, steadiness);
        }

        private static EvaluationVerdict Failed(AttemptMetrics m, bool overlap, string dominant, string correction)
        {
            return new EvaluationVerdict(false, overlap, 0.0, dominant, correction, ScoreComponents.Zero);
        }

        private static string DominantGate(AttemptMetrics m)
        {
            double radialViolation = m.RadialOffsetM / ScoringTolerances.RadialM;
            double angleViolation = m.AngularErrorDeg / ScoringTolerances.AngleDeg;
            double gapViolation = Math.Abs(m.GapM) / ScoringTolerances.GapM;

            string dominant = Diagnostics.Radial;
            double best = radialViolation;
            if (angleViolation > best)
            {
                dominant = Diagnostics.Angle;
                best = angleViolation;
            }

            if (gapViolation > best)
            {
                dominant = Diagnostics.Gap;
            }

            return dominant;
        }

        private static string CorrectionFor(AttemptMetrics m, string dominant)
        {
            switch (dominant)
            {
                case Diagnostics.Radial:
                    return RadialCorrection(m);
                case Diagnostics.Angle:
                    return m.DeviationRightDeg() >= m.DeviationLeftDeg()
                        ? Diagnostics.RotateRightPipe
                        : Diagnostics.RotateLeftPipe;
                case Diagnostics.Gap:
                    return m.GapM > 0 ? Diagnostics.CloseGap : Diagnostics.OpenGap;
                default:
                    return Diagnostics.None;
            }
        }

        private static string RadialCorrection(AttemptMetrics m)
        {
            bool heightDominant = Math.Abs(m.HeightDeltaM) >= Math.Abs(m.DepthDeltaM);
            if (heightDominant)
            {
                if (m.HeightDeltaM > 0)
                {
                    return Diagnostics.LowerRightPipe;
                }

                if (m.HeightDeltaM < 0)
                {
                    return Diagnostics.RaiseRightPipe;
                }

                return Diagnostics.LowerRightPipe;
            }

            return m.DepthDeltaM > 0 ? Diagnostics.PushRightPipeBack : Diagnostics.PullRightPipeForward;
        }

        private static string AdvisoryCorrection(ScoreComponents components)
        {
            double min = Math.Min(
                Math.Min(components.AlignmentPoints, components.AnglePoints),
                Math.Min(components.GapPoints, Math.Min(components.TimePoints, components.SteadinessPoints)));
            if (components.SteadinessPoints < 8.0 && components.SteadinessPoints <= min)
            {
                return Diagnostics.SteadyHands;
            }

            return Diagnostics.None;
        }

        private static double Clamp01(double v)
        {
            if (v < 0.0)
            {
                return 0.0;
            }

            return v > 1.0 ? 1.0 : v;
        }
    }

    public static class AttemptMetricsExtensions
    {
        public static double DeviationLeftDeg(this AttemptMetrics m) =>
            Math.Sqrt(m.YawErrorLeftDeg * m.YawErrorLeftDeg + m.PitchErrorLeftDeg * m.PitchErrorLeftDeg);

        public static double DeviationRightDeg(this AttemptMetrics m) =>
            Math.Sqrt(m.YawErrorRightDeg * m.YawErrorRightDeg + m.PitchErrorRightDeg * m.PitchErrorRightDeg);
    }
}
