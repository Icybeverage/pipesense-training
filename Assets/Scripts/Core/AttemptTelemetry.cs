using System;

namespace PipeSense.Core
{
    /// <summary>
    /// Wire contract with the local backend (backend/app/schemas.py mirrors these names).
    /// JsonUtility rules: public fields only, no properties, no dictionaries.
    /// </summary>
    [Serializable]
    public class AttemptTelemetry
    {
        public string sessionId;
        public int attemptIndex;
        public string startedUtc;
        public double durationSeconds;
        public GeometryBlock geometry = new GeometryBlock();
        public HandsBlock hands = new HandsBlock();
        public VerdictBlock verdict = new VerdictBlock();
        public HistoryEntry[] history = Array.Empty<HistoryEntry>();
        public string inputSource;
        public string unityVersion;
    }

    [Serializable]
    public class GeometryBlock
    {
        public double gapM;
        public double radialOffsetM;
        public double angularErrorDeg;
        public double heightDeltaM;
        public double depthDeltaM;
        public double yawErrorLeftDeg;
        public double pitchErrorLeftDeg;
        public double yawErrorRightDeg;
        public double pitchErrorRightDeg;
    }

    [Serializable]
    public class HandsBlock
    {
        public bool leftTracked;
        public bool rightTracked;
        public bool leftGripClosed;
        public bool rightGripClosed;
        public double jitterMps;
    }

    [Serializable]
    public class VerdictBlock
    {
        public bool connected;
        public bool overlap;
        public double scoreValue;
        public string dominantError;
        public string correction;
        public double alignmentPoints;
        public double anglePoints;
        public double gapPoints;
        public double timePoints;
        public double steadinessPoints;
    }

    [Serializable]
    public class HistoryEntry
    {
        public int attemptIndex;
        public double scoreValue;
        public bool connected;
        public double durationSeconds;
        public double jitterMps;
        public string dominantError;
    }

    public static class AttemptTelemetryBuilder
    {
        public static AttemptTelemetry FromMetrics(string sessionId, int attemptIndex, string startedUtc, AttemptMetrics metrics, EvaluationVerdict verdict, HistoryEntry[] history, string inputSource, string unityVersion)
        {
            var telemetry = new AttemptTelemetry
            {
                sessionId = sessionId,
                attemptIndex = attemptIndex,
                startedUtc = startedUtc,
                durationSeconds = metrics.DurationSeconds,
                inputSource = inputSource,
                unityVersion = unityVersion,
                history = history ?? Array.Empty<HistoryEntry>(),
            };

            telemetry.geometry.gapM = metrics.GapM;
            telemetry.geometry.radialOffsetM = metrics.RadialOffsetM;
            telemetry.geometry.angularErrorDeg = metrics.AngularErrorDeg;
            telemetry.geometry.heightDeltaM = metrics.HeightDeltaM;
            telemetry.geometry.depthDeltaM = metrics.DepthDeltaM;
            telemetry.geometry.yawErrorLeftDeg = metrics.YawErrorLeftDeg;
            telemetry.geometry.pitchErrorLeftDeg = metrics.PitchErrorLeftDeg;
            telemetry.geometry.yawErrorRightDeg = metrics.YawErrorRightDeg;
            telemetry.geometry.pitchErrorRightDeg = metrics.PitchErrorRightDeg;

            telemetry.hands.leftTracked = metrics.LeftTracked;
            telemetry.hands.rightTracked = metrics.RightTracked;
            telemetry.hands.leftGripClosed = metrics.LeftGripClosed;
            telemetry.hands.rightGripClosed = metrics.RightGripClosed;
            telemetry.hands.jitterMps = metrics.JitterMps;

            telemetry.verdict.connected = verdict.Connected;
            telemetry.verdict.overlap = verdict.Overlap;
            telemetry.verdict.scoreValue = verdict.ScoreValue;
            telemetry.verdict.dominantError = verdict.DominantError;
            telemetry.verdict.correction = verdict.Correction;
            telemetry.verdict.alignmentPoints = verdict.Components.AlignmentPoints;
            telemetry.verdict.anglePoints = verdict.Components.AnglePoints;
            telemetry.verdict.gapPoints = verdict.Components.GapPoints;
            telemetry.verdict.timePoints = verdict.Components.TimePoints;
            telemetry.verdict.steadinessPoints = verdict.Components.SteadinessPoints;

            return telemetry;
        }

        public static AttemptMetrics ToMetrics(AttemptTelemetry telemetry)
        {
            return new AttemptMetrics
            {
                GapM = telemetry.geometry.gapM,
                RadialOffsetM = telemetry.geometry.radialOffsetM,
                AngularErrorDeg = telemetry.geometry.angularErrorDeg,
                HeightDeltaM = telemetry.geometry.heightDeltaM,
                DepthDeltaM = telemetry.geometry.depthDeltaM,
                YawErrorLeftDeg = telemetry.geometry.yawErrorLeftDeg,
                PitchErrorLeftDeg = telemetry.geometry.pitchErrorLeftDeg,
                YawErrorRightDeg = telemetry.geometry.yawErrorRightDeg,
                PitchErrorRightDeg = telemetry.geometry.pitchErrorRightDeg,
                DurationSeconds = telemetry.durationSeconds,
                JitterMps = telemetry.hands.jitterMps,
                LeftTracked = telemetry.hands.leftTracked,
                RightTracked = telemetry.hands.rightTracked,
                LeftGripClosed = telemetry.hands.leftGripClosed,
                RightGripClosed = telemetry.hands.rightGripClosed,
            };
        }
    }
}
