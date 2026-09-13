using NUnit.Framework;

namespace PipeSense.Tests
{
    public sealed class PipeSenseTests
    {
        [Test]
        public void AlignedAttemptConnects()
        {
            var score = PipeScorer.Evaluate(new PipeAttempt { leftGap = .1f, rightGap = .1f, verticalError = .05f, actionOrderValid = true });
            Assert.That(score.connected, Is.True);
            Assert.That(score.total, Is.EqualTo(100));
        }

        [Test]
        public void HeightErrorProducesActionableIssue()
        {
            var score = PipeScorer.Evaluate(new PipeAttempt { leftGap = .1f, rightGap = .1f, verticalError = .8f, actionOrderValid = true });
            Assert.That(score.connected, Is.False);
            Assert.That(score.primaryIssue, Is.EqualTo("height_alignment"));
        }

        [Test]
        public void LoopMeasuresRetryImprovement()
        {
            var loop = new AttemptLoop(); loop.BeginAttempt();
            loop.CompleteAttempt(new PipeScore { total = 30 }); loop.BeginRetry();
            Assert.That(loop.CompleteAttempt(new PipeScore { total = 70 }), Is.True);
            Assert.That(loop.AttemptNumber, Is.EqualTo(2));
        }
    }
}

