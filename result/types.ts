export type ContainmentResultValue = "CONTAIN" | "PARTIALY_CONTAIN" | "ALIGNED" | "DEPEND" | "REJECTED";

export type ContainmentTypeValue = "FULL" | "PARTIAL" | "NONE";

export type ContainmentType = {
  result: ContainmentTypeValue;
};

export type DependentStarPattern = {
  starPattern: string;
  shape?: string[];
  origin: string;
};

/** Mirrors IBindings — all method return values captured as plain data fields. */
export type Bindings = {
  isFullyBounded: boolean;
  containmentType: ContainmentType;
  shouldVisitShape: boolean;
  unboundedTriples: { subject: string; predicate: string; object: string }[];
  boundTriples:     { subject: string; predicate: string; object: string }[];
  bindings: Record<string, { subject: string; predicate: string; object: string } | undefined>;
  nestedContainedStarPatterns: DependentStarPattern[];
  nestedContainedStarPatternShapesContained: Record<string, string[]>;
};

/** Mirrors IContainmentResult. */
export type StarPatternContainment = {
  result: ContainmentResultValue;
  target?: string[];
  bindings: Record<string, Bindings>;
};

/** Mirrors IResult. */
export type Result = {
  visitShapeBoundedResource: Record<string, boolean>;
  starPatternsContainment: Record<string, StarPatternContainment>;
};
