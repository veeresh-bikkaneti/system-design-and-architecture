import { useState } from 'react';
import { QUIZ_PASS_THRESHOLD, useProgressStore } from '../store/progress';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizProps {
  lessonSlug: string;
  questions: QuizQuestion[];
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.3 7.3a1 1 0 0 1 1.4 0L10 7.6l.3-.3a1 1 0 1 1 1.4 1.4L11.4 9l.3.3a1 1 0 1 1-1.4 1.4L10 10.4l-.3.3a1 1 0 1 1-1.4-1.4l.3-.3-.3-.3a1 1 0 0 1 0-1.4Z"
        clipRule="evenodd"
      />
    </svg>
  );
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

  return (
    <div className="not-prose my-10 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_2px_12px_rgb(120_53_15/0.07)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
      <div className="border-b border-stone-200/80 bg-amber-50/70 px-5 py-4 sm:px-6 dark:border-zinc-800 dark:bg-amber-950/20">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
            Check your understanding
          </h3>
          <p
            className="shrink-0 text-xs font-medium text-stone-500 dark:text-zinc-400"
            aria-live="polite"
          >
            {answeredCount} of {total} answered
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Quiz questions answered"
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-zinc-700"
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
            style={{ width: `${total > 0 ? (answeredCount / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-7 px-5 py-6 sm:px-6">
        {questions.map((q, qIndex) => {
          const selectedOption = selected[qIndex];
          const answeredCorrectly = selectedOption === q.correctIndex;
          return (
            <fieldset key={qIndex}>
              <legend className="mb-3 flex items-start gap-3 text-sm font-semibold leading-snug text-stone-900 dark:text-zinc-100">
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
                    'group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-all duration-150 focus-within:outline-none focus-within:ring-2 focus-within:ring-amber-600 focus-within:ring-offset-2 dark:focus-within:ring-offset-zinc-900';

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
                        ' cursor-default border-stone-200 text-stone-400 dark:border-zinc-800 dark:text-zinc-500';
                    }
                  } else {
                    optionClasses += isSelected
                      ? ' border-amber-600 bg-amber-50 text-stone-900 shadow-[0_1px_6px_rgb(180_83_9/0.15)] dark:border-amber-500 dark:bg-amber-950/40 dark:text-zinc-100'
                      : ' border-stone-200 bg-white text-stone-700 hover:-translate-y-px hover:border-amber-400 hover:bg-amber-50/50 hover:shadow-[0_2px_8px_rgb(180_83_9/0.08)] active:translate-y-0 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-700 dark:hover:bg-amber-950/20';
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
                        <CheckIcon className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                      )}
                      {submitted && isSelected && !isCorrectOption && (
                        <XIcon className="h-5 w-5 shrink-0 text-red-500 dark:text-red-400" />
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
                      : 'text-stone-500 dark:text-zinc-400'
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

      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200/80 bg-stone-50/60 px-5 py-4 sm:px-6 dark:border-zinc-800 dark:bg-zinc-900/60">
        {!submitted ? (
          <>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!allAnswered}
              className="inline-flex items-center rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_rgb(180_83_9/0.3)] transition-all hover:-translate-y-px hover:bg-amber-800 hover:shadow-[0_4px_12px_rgb(180_83_9/0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
            >
              Check answers
            </button>
            {!allAnswered && (
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Answer every question to check your work.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
                You scored {correctCount} / {total}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                  passed
                    ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                {passed ? 'Passed' : 'Not yet'}
              </span>
            </div>
            <p className="w-full text-xs text-stone-500 dark:text-zinc-400">
              {passed
                ? 'You passed \u2014 solid work. On to the next lesson.'
                : 'Not quite there \u2014 the right answers are highlighted above. Give it another go.'}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="ml-auto inline-flex items-center rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-px hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 active:translate-y-0 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-700 dark:hover:bg-amber-950/30 dark:hover:text-amber-200"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
