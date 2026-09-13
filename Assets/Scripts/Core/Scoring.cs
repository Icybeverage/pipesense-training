namespace PipeSense.Core
{
    /// <summary>
    /// Single source of truth for connection tolerances. The Python backend mirrors these
    /// exact literals in backend/app/scoring.py; parity fixtures in docs/fixtures verify both.
    /// </summary>
    public static class ScoringTolerances
    {
        public const double GapM = 0.015;
        public const double RadialM = 0.012;
        public const double AngleDeg = 5.0;
        public const double OverlapM = -0.005;
        public const double JitterMps = 0.6;
        public const double TargetSeconds = 8.0;
        public const double MaxSeconds = 40.0;

        public const double AlignmentWeight = 25.0;
        public const double AngleWeight = 25.0;
        public const double GapWeight = 20.0;
        public const double TimeWeight = 15.0;
        public const double SteadinessWeight = 15.0;
    }

    /// <summary>Fixed vocabulary shared with the backend language layer.</summary>
    public static class Diagnostics
    {
        public const string None = "none";
        public const string Tracking = "tracking";
        public const string Grip = "grip";
        public const string Radial = "radial";
        public const string Angle = "angle";
        public const string Gap = "gap";

        public const string NoTracking = "no_tracking";
        public const string RegripBoth = "regrip_both";
        public const string LowerRightPipe = "lower_right_pipe";
        public const string RaiseRightPipe = "raise_right_pipe";
        public const string LowerLeftPipe = "lower_left_pipe";
        public const string RaiseLeftPipe = "raise_left_pipe";
        public const string PushRightPipeBack = "push_right_pipe_back";
        public const string PullRightPipeForward = "pull_right_pipe_forward";
        public const string PushLeftPipeBack = "push_left_pipe_back";
        public const string PullLeftPipeForward = "pull_left_pipe_forward";
        public const string RotateRightPipe = "rotate_right_pipe";
        public const string RotateLeftPipe = "rotate_left_pipe";
        public const string CloseGap = "close_gap";
        public const string OpenGap = "open_gap";
        public const string SteadyHands = "steady_hands";

        public static string Describe(string dominantError) => dominantError switch
        {
            Tracking => "hand tracking lost",
            Grip => "a hand was open",
            Radial => "flange centres offset",
            Angle => "pipe axes not parallel",
            Gap => "flange faces not seated",
            _ => "connection within tolerance",
        };
    }
}
