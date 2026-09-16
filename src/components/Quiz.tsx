import { useState } from 'react';
import { QUIZ_PASS_THRESHOLD, useProgressStore } from '../store/progress';
import { Button, buttonClasses } from './ui/Button';
import { Icon } from './ui/Icon';
import { Pill } from './ui/Pill';
import { ProgressBar } from './ui/ProgressBar';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizProps {
  lessonSlug: string;
  questions: QuizQuestion[];
}

export function Quiz({ lessonSlug, questions }: QuizProps) {
  const recordQuizResult = useProgressStore((state) => state.recordQuizResult);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = questions.every((_, i) => selected[i] !== undefined);
  const answeredCount = Object.keys(selected).length;

  const correctCount = questions.reduce(
    (count, q, i) => (selected[i] === q.correctIndex ? count + 1 : count),
    0,
  );
  const total = questions.length;
  const passed = total > 0 && correctCount / total >= QUIZ_PASS_THRESHOLD;

  function handleSelect(questionIndex: number, optionIndex: number) {
    if (submitted) return;
    setSelected((prev) => ({ ...prev, [questionIndex]: optionIndex }));
  }

  function handleSubmit() {
    setSubmitted(true);
    recordQuizResult(lessonSlug, correctCount, total);
  }

  function handleRetry() {
    setSelected({});
    setSubmitted(false);
  }

  function handleRetake() {
    // A retake overwrites the recorded quiz result (and can revoke a
    // quiz-ace badge), so a passed quiz requires explicit confirmation.
    const ok = window.confirm(
      `Retaking this quiz will replace your recorded score of ${correctCount} out of ${total}. Continue?`,
    );
    if (ok) handleRetry();
  }

  return (
    <div className="not-prose my-10 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_2px_12px_rgb(120_53_15/0.07)] dark:border-stone-800 dark:bg-stone-900 dark:shadow-none">
      <div className="border-b border-stone-200/80 bg-amber-50/70 px-5 py-4 sm:px-6 dark:border-stone-800 dark:bg-amber-950/20">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            Check your understanding
          </h3>
          <p
            className="shrink-0 text-xs font-medium text-stone-500 dark:text-stone-400"
            aria-live="polite"
          >
            {answeredCount} of {total} answered
          </p>
        </div>
        <ProgressBar
          value={answeredCount}
          max={total}
          label="Quiz questions answered"
          className="mt-3"
        />
      </div>

      <div className="space-y-7 px-5 py-6 sm:px-6">
        {questions.map((q, qIndex) => {
          const selectedOption = selected[qIndex];
          const answeredCorrectly = selectedOption === q.correctIndex;
          return (
            <fieldset key={qIndex}>
              <legend className="mb-3 flex items-start gap-3 text-sm font-semibold leading-snug text-stone-900 dark:text-stone-100">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                >
                  {qIndex + 1}
                </span>
                <span>{q.question}</span>
              </legend>
              <div className="space-y-2 pl-9" role="radiogroup" aria-label={`Question ${qIndex + 1}`}>
                {q.options.map((option, oIndex) => {
                  const isSelected = selectedOption === oIndex;
                  const isCorrectOption = oIndex === q.correctIndex;

                  let optionClasses =
                    'group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-[border-color,background-color,box-shadow,transform,color] duration-150 focus-within:outline-none focus-within:ring-2 focus-within:ring-amber-600 focus-within:ring-offset-2 dark:focus-within:ring-offset-stone-900';

                  if (submitted) {
                    if (isSelected && isCorrectOption) {
                      optionClasses +=
                        ' border-green-600 bg-green-50 text-green-900 shadow-[0_1px_4px_rgb(22_101_52/0.12)] dark:border-green-500 dark:bg-green-950/50 dark:text-green-100';
                    } else if (isSelected && !isCorrectOption) {
                      optionClasses +=
                        ' border-red-500 bg-red-50 text-red-900 shadow-[0_1px_4px_rgb(153_27_27/0.12)] dark:border-red-500 dark:bg-red-950/50 dark:text-red-100';
                    } else if (isCorrectOption) {
                      optionClasses +=
                        ' border-dashed border-green-600/60 bg-transparent text-green-800 dark:border-green-500/60 dark:text-green-300';
                    } else {
                      optionClasses +=
                        ' cursor-default border-stone-200 text-stone-400 dark:border-stone-800 dark:text-stone-400';
                    }
                  } else {
                    optionClasses += isSelected
                      ? ' border-amber-600 bg-amber-50 text-stone-900 shadow-[0_1px_6px_rgb(180_83_9/0.15)] dark:border-amber-500 dark:bg-amber-950/40 dark:text-stone-100'
                      : ' border-stone-200 bg-white text-stone-700 hover:-translate-y-px hover:border-amber-400 hover:bg-amber-50/50 hover:shadow-[0_2px_8px_rgb(180_83_9/0.08)] active:translate-y-0 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-amber-700 dark:hover:bg-amber-950/20';
                  }

                  return (
                    <label key={oIndex} className={optionClasses}>
                      <input
                        type="radio"
                        name={`${lessonSlug}-q${qIndex}`}
                        checked={isSelected}
                        disabled={submitted}
                        onChange={() => handleSelect(qIndex, oIndex)}
                        className="h-4 w-4 shrink-0 accent-amber-700 focus-visible:outline-none dark:accent-amber-500"
                      />
                      <span className="flex-1">{option}</span>
                      {submitted && isSelected && isCorrectOption && (
                        <Icon name="checkCircle" className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                      )}
                      {submitted && isSelected && !isCorrectOption && (
                        <Icon name="xCircle" className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
                      )}
                    </label>
                  );
                })}
              </div>
              {submitted && (
                <p
                  className={`pl-9 pt-2 text-xs font-medium ${
                    answeredCorrectly
                      ? 'text-green-700 dark:text-green-300'
                      : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {answeredCorrectly
                    ? 'That\u2019s right \u2014 nice work.'
                    : 'Not quite \u2014 the correct answer is marked above.'}
                </p>
              )}
            </fieldset>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 border-t border-stone-200/80 bg-stone-50/60 px-5 py-4 sm:px-6 dark:border-stone-800 dark:bg-stone-900/60"
      >
        {!submitted ? (
          <>
            <Button type="button" onClick={handleSubmit} disabled={!allAnswered}>
              Check answers
            </Button>
            {!allAnswered && (
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Answer every question to check your work.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                You scored {correctCount} / {total}
              </span>
              <Pill tone={passed ? 'success' : 'accent'}>
                {passed ? 'Passed' : 'Not yet'}
              </Pill>
            </div>
            <p className="w-full text-xs text-stone-500 dark:text-stone-400">
              {passed
                ? 'You passed \u2014 solid work. On to the next lesson.'
                : 'Not quite there \u2014 the right answers are highlighted above. Give it another go.'}
            </p>
            {passed ? (
              // Passed quizzes keep a quiet, guarded retake: resubmitting
              // overwrites the recorded score, so this asks first.
              <button
                type="button"
                onClick={handleRetake}
                className="ml-auto text-xs font-medium text-stone-500 underline decoration-stone-300 underline-offset-2 transition-colors hover:text-stone-800 dark:text-stone-400 dark:decoration-stone-600 dark:hover:text-stone-200"
              >
                Retake quiz
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRetry}
                className={buttonClasses('secondary', 'sm', 'ml-auto')}
              >
                Try again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
