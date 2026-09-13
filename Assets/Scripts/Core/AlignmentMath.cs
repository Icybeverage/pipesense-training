using UnityEngine;

namespace PipeSense.Core
{
    /// <summary>
    /// Measures the connection geometry between two connector poses.
    /// Convention: pipes run along world X. The left pipe's expected axis is +X and the
    /// right pipe's expected axis is -X; both flange faces are local-origin points on
    /// their pipe roots, so world positions are directly comparable.
    /// </summary>
    public struct ConnectorPose
    {
        public Vector3 FlangeFaceCenter;
        public Vector3 Axis;

        public ConnectorPose(Vector3 flangeFaceCenter, Vector3 axis)
        {
            FlangeFaceCenter = flangeFaceCenter;
            Axis = axis.normalized;
        }
    }

    public static class AlignmentMath
    {
        public static AttemptMetrics Measure(ConnectorPose left, ConnectorPose right)
        {
            var metrics = new AttemptMetrics();
            FillGeometry(ref metrics, left, right);
            return metrics;
        }

        public static void FillGeometry(ref AttemptMetrics metrics, ConnectorPose left, ConnectorPose right)
        {
            double dx = right.FlangeFaceCenter.x - left.FlangeFaceCenter.x;
            double dy = right.FlangeFaceCenter.y - left.FlangeFaceCenter.y;
            double dz = right.FlangeFaceCenter.z - left.FlangeFaceCenter.z;

            metrics.GapM = dx;
            metrics.HeightDeltaM = dy;
            metrics.DepthDeltaM = dz;
            metrics.RadialOffsetM = System.Math.Sqrt((dy * dy) + (dz * dz));

            metrics.YawErrorLeftDeg = SignedYawDeg(left.Axis, 0.0);
            metrics.PitchErrorLeftDeg = SignedPitchDeg(left.Axis);
            metrics.YawErrorRightDeg = SignedYawDeg(right.Axis, 180.0);
            metrics.PitchErrorRightDeg = SignedPitchDeg(right.Axis);

            double deviationLeft = metrics.DeviationLeftDeg();
            double deviationRight = metrics.DeviationRightDeg();
            metrics.AngularErrorDeg = System.Math.Max(deviationLeft, deviationRight);
        }

        /// <summary>Yaw in degrees relative to the expected axis (0 deg = +X, 180 deg = -X).</summary>
        public static double SignedYawDeg(Vector3 axis, double expectedYawDeg)
        {
            double yaw = System.Math.Atan2(axis.z, axis.x) * Mathf.Rad2Deg;
            double delta = NormalizeDegrees(yaw - expectedYawDeg);
            return delta;
        }

        public static double SignedPitchDeg(Vector3 axis)
        {
            return System.Math.Asin(Mathf.Clamp(axis.y, -1f, 1f)) * Mathf.Rad2Deg;
        }

        public static double NormalizeDegrees(double degrees)
        {
            degrees %= 360.0;
            if (degrees > 180.0)
            {
                degrees -= 360.0;
            }
            else if (degrees < -180.0)
            {
                degrees += 360.0;
            }

            return degrees;
        }

        /// <summary>True when every gate (ignoring hand tracking) is satisfied.</summary>
        public static bool WithinTolerance(AttemptMetrics m)
        {
            return m.RadialOffsetM <= ScoringTolerances.RadialM
                && m.AngularErrorDeg <= ScoringTolerances.AngleDeg
                && System.Math.Abs(m.GapM) <= ScoringTolerances.GapM
                && m.GapM >= ScoringTolerances.OverlapM;
        }
    }
}
