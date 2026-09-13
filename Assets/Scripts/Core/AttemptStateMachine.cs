namespace PipeSense.Core
{
    public enum AttemptPhase
    {
        Idle,
        Briefing,
        Aligning,
        Evaluating,
        Failed,
        Coaching,
        Retry,
        Snapping,
        Snapped,
        Complete,
    }

    public enum AttemptEvent
    {
        SessionStarted,
        BriefingDelivered,
        AttemptCommitted,
        EvaluationPassed,
        EvaluationFailed,
        CoachingDelivered,
        SnapFinished,
        SummaryDelivered,
        ResetRequested,
    }

    /// <summary>
    /// Pure attempt lifecycle. Unity drives it with events; tests drive it directly.
    /// Rejected transitions never mutate state.
    /// </summary>
    public sealed class AttemptStateMachine
    {
        public AttemptPhase Phase { get; private set; } = AttemptPhase.Idle;
        public int AttemptCount { get; private set; }
        public string SessionId { get; private set; } = string.Empty;

        public void StartNewSession(string sessionId)
        {
            SessionId = sessionId ?? string.Empty;
            AttemptCount = 0;
            Phase = AttemptPhase.Idle;
        }

        public bool TryFire(AttemptEvent attemptEvent)
        {
            return TryFire(attemptEvent, out _);
        }

        public bool TryFire(AttemptEvent attemptEvent, out string rejection)
        {
            switch (attemptEvent)
            {
                case AttemptEvent.SessionStarted:
                    return Move(Phase == AttemptPhase.Idle || Phase == AttemptPhase.Complete, AttemptPhase.Briefing, attemptEvent, out rejection);
                case AttemptEvent.BriefingDelivered:
                    return Move(Phase == AttemptPhase.Briefing, AttemptPhase.Aligning, attemptEvent, out rejection);
                case AttemptEvent.AttemptCommitted:
                    if (Phase == AttemptPhase.Aligning || Phase == AttemptPhase.Retry)
                    {
                        AttemptCount++;
                        Phase = AttemptPhase.Evaluating;
                        rejection = null;
                        return true;
                    }

                    return Reject(attemptEvent, out rejection);
                case AttemptEvent.EvaluationPassed:
                    return Move(Phase == AttemptPhase.Evaluating, AttemptPhase.Snapping, attemptEvent, out rejection);
                case AttemptEvent.EvaluationFailed:
                    return Move(Phase == AttemptPhase.Evaluating, AttemptPhase.Failed, attemptEvent, out rejection);
                case AttemptEvent.CoachingDelivered:
                    return Move(Phase == AttemptPhase.Failed, AttemptPhase.Retry, attemptEvent, out rejection);
                case AttemptEvent.SnapFinished:
                    return Move(Phase == AttemptPhase.Snapping, AttemptPhase.Snapped, attemptEvent, out rejection);
                case AttemptEvent.SummaryDelivered:
                    return Move(Phase == AttemptPhase.Snapped, AttemptPhase.Complete, attemptEvent, out rejection);
                case AttemptEvent.ResetRequested:
                    return Move(IsResettable(Phase), AttemptPhase.Aligning, attemptEvent, out rejection);
                default:
                    return Reject(attemptEvent, out rejection);
            }
        }

        private static bool IsResettable(AttemptPhase phase)
        {
            return phase == AttemptPhase.Aligning
                || phase == AttemptPhase.Retry
                || phase == AttemptPhase.Failed
                || phase == AttemptPhase.Coaching;
        }

        private bool Move(bool allowed, AttemptPhase next, AttemptEvent attemptEvent, out string rejection)
        {
            if (!allowed)
            {
                return Reject(attemptEvent, out rejection);
            }

            Phase = next;
            rejection = null;
            return true;
        }

        private bool Reject(AttemptEvent attemptEvent, out string rejection)
        {
            rejection = $"event {attemptEvent} rejected in phase {Phase}";
            return false;
        }
    }
}
