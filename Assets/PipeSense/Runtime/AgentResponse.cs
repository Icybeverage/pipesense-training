using System;

namespace PipeSense
{
    [Serializable]
    public sealed class AgentResponse
    {
        public string observer;
        public string coach;
        public string evaluator;
        public string strategy;
        public bool improved;
    }

    public static class OfflineAgents
    {
        public static AgentResponse Evaluate(PipeScore score, float previousScore)
        {
            var improved = previousScore < 0f || score.total > previousScore;
            var coach = score.primaryIssue switch
            {
                "sequence" => "Coach: Support both sides before you make the connection.",
                "height_alignment" => "Coach: Match the pipe heights first. Use W and K to level your hands.",
                "connection_gap" => "Coach: Keep the ends level, then bring both hands slowly toward the trap.",
                _ => "Coach: Connection sealed. The water held in this trap blocks sewer gases."
            };
            return new AgentResponse
            {
                observer = $"Observer: {score.primaryIssue.Replace('_', ' ')} detected at {score.total:0} percent.",
                coach = coach,
                evaluator = previousScore < 0f ? "Evaluator: Baseline recorded." :
                    $"Evaluator: Score {(improved ? "improved" : "did not improve")} from {previousScore:0} to {score.total:0}.",
                strategy = improved ? "reinforce" : "change_modality",
                improved = improved
            };
        }
    }
}

