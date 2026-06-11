export type UserStage =
  | 'first_time_user'
  | 'browsing_pgs'
  | 'booking_flow'
  | 'resident_dashboard';

export type PageContext = {
  pathname: string;
  title: string;
  headings: string[];
  buttons: string[];
  links: string[];
  sectionCount: number;
  textPreview: string;
};

export type ElementContext = {
  tag: string;
  text: string;
  role: string | null;
  inputType: string | null;
  ariaLabel: string | null;
};

export type CockroachExplainRequest = {
  pageContext: PageContext;
  elementContext: ElementContext;
  userStage?: UserStage;
};

export type CockroachExplainResponse = {
  text: string;
};
