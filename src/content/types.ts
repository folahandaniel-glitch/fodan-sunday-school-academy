/** Compact authoring format for lesson content. build.ts expands each seed into the full structured lesson, questions and blueprints. */
export type Mcq = [question: string, options: [string, string, string, string], correctIndex: 0 | 1 | 2 | 3, explanation: string];
export type Tf = [statement: string, isTrue: boolean, explanation: string];
export type Short = [question: string, keywords: string[], rubric: string];

export interface LessonSeed {
  w: number;
  title: string;
  theme: string;
  summary: string;
  scripture: string[];                 // primary references
  more: string[];                      // supporting references
  memory: string;                      // memory verse REFERENCE (text is read from the Bible data, never typed)
  objectives: string[];
  terms: [term: string, meaning: string][];
  intro: string;
  context: string;
  observe: string;
  points: [heading: string, body: string][];
  discuss: [question: string, guidance: string][];
  apply: string;
  activity: string;
  takeHome: string;
  prayer: string;
  teacher: string;
  assess: string;
  minutes?: number;
  mcq1: Mcq; mcq2: Mcq; tf: Tf; sa: Short;
}
