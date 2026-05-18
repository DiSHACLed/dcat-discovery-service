import { ContainmentResult, ContainmentType as ContainmentTypeEnum } from 'query-shape-detection';
import type { IResult, IContainmentResult, IBindings, ITriple } from 'query-shape-detection';
import type {
  Bindings,
  ContainmentResultValue,
  ContainmentTypeValue,
  Result,
  StarPatternContainment,
} from './types';

function toContainmentResultValue(r: ContainmentResult): ContainmentResultValue {
  switch (r) {
    case ContainmentResult.CONTAIN:          return "CONTAIN";
    case ContainmentResult.PARTIALY_CONTAIN: return "PARTIALY_CONTAIN";
    case ContainmentResult.ALIGNED:          return "ALIGNED";
    case ContainmentResult.DEPEND:           return "DEPEND";
    case ContainmentResult.REJECTED:         return "REJECTED";
  }
}

function toContainmentTypeValue(t: ContainmentTypeEnum): ContainmentTypeValue {
  switch (t) {
    case ContainmentTypeEnum.FULL:    return "FULL";
    case ContainmentTypeEnum.PARTIAL: return "PARTIAL";
    case ContainmentTypeEnum.NONE:    return "NONE";
  }
}

function termValue(object: ITriple['object']): string {
  return Array.isArray(object)
    ? object.map(t => t.value).join(' ')
    : object.value;
}

function tripleToPlain(triple: ITriple) {
  return { subject: triple.subject, predicate: triple.predicate, object: termValue(triple.object) };
}

function toBindings(b: IBindings): Bindings {
  const rawBindings = b.getBindings();
  const bindings: Bindings['bindings'] = {};
  for (const [key, triple] of rawBindings) {
    bindings[key] = triple !== undefined ? tripleToPlain(triple) : undefined;
  }

  const shapesContained = b.getNestedContainedStarPatternNameShapesContained();
  const nestedContainedStarPatternShapesContained: Record<string, string[]> = {};
  for (const [key, shapes] of shapesContained) {
    nestedContainedStarPatternShapesContained[key] = shapes;
  }

  const containmentType = b.containmentType();

  return {
    isFullyBounded:   b.isFullyBounded(),
    containmentType:  { result: toContainmentTypeValue(containmentType.result) },
    shouldVisitShape: b.shouldVisitShape(),
    unboundedTriples: b.getUnboundedTriple().map(tripleToPlain),
    boundTriples:     b.getBoundTriple().map(tripleToPlain),
    bindings,
    nestedContainedStarPatterns: b.getNestedContainedStarPatternName().map(({ starPattern, shape, origin }) => ({
      starPattern,
      ...(shape !== undefined ? { shape } : {}),
      origin,
    })),
    nestedContainedStarPatternShapesContained,
  };
}

function toStarPatternContainment(c: IContainmentResult): StarPatternContainment {
  const bindings: Record<string, Bindings> = {};
  for (const [key, b] of c.bindings) {
    bindings[key] = toBindings(b);
  }

  return {
    result: toContainmentResultValue(c.result),
    ...(c.target !== undefined ? { target: c.target } : {}),
    bindings,
  };
}

export function toResult(r: IResult): Result {
  const visitShapeBoundedResource: Record<string, boolean> = {};
  for (const [shape, visited] of r.visitShapeBoundedResource) {
    visitShapeBoundedResource[shape] = visited;
  }

  const starPatternsContainment: Record<string, StarPatternContainment> = {};
  for (const [starPattern, containment] of r.starPatternsContainment) {
    starPatternsContainment[starPattern] = toStarPatternContainment(containment);
  }

  return { visitShapeBoundedResource, starPatternsContainment };
}
