namespace PipeSense
{
    public enum LoopStage { Ready, Observing, Coaching, Retrying, Evaluating, Connected }

    public sealed class AttemptLoop
    {
        public LoopStage Stage { get; private set; } = LoopStage.Ready;
        public int AttemptNumber { get; private set; }
        public float PreviousScore { get; private set; } = -1f;

        public void BeginAttempt() => Stage = AttemptNumber == 0 ? LoopStage.Observing : LoopStage.Retrying;

        public bool CompleteAttempt(PipeScore score)
        {
            Stage = LoopStage.Evaluating;
            var improved = PreviousScore < 0f || score.total > PreviousScore;
            PreviousScore = score.total;
            AttemptNumber++;
            Stage = score.connected ? LoopStage.Connected : LoopStage.Coaching;
            return improved;
        }

        public void BeginRetry()
        {
            if (Stage == LoopStage.Coaching) Stage = LoopStage.Retrying;
        }
    }
}

