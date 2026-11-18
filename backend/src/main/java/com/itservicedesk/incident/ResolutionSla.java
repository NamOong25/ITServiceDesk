package com.itservicedesk.incident;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

record ResolutionSla(State state, long targetMinutes, long usedMinutes, long remainingMinutes,
                     Instant dueAt, Instant resolvedAt) {
    static ResolutionSla evaluate(String impact, OffsetDateTime createdAt, List<IncidentActivity> timeline, Instant now) {
        Duration target = Duration.ofHours(switch (impact) {
            case "MANY_USERS" -> 4;
            case "TEAM" -> 8;
            default -> 16;
        });
        List<FirstReplySla.WorkPeriod> active = new ArrayList<>();
        Instant started = createdAt.toInstant();
        Instant resolvedAt = null;
        for (IncidentActivity event : timeline) {
            Instant at = event.createdAt().toInstant();
            if (at.isBefore(createdAt.toInstant()) || at.isAfter(now)) continue;
            switch (event.kind()) {
                case "WAIT_REQUESTED", "RESOLVED" -> {
                    if (started != null) active.add(new FirstReplySla.WorkPeriod(started, at));
                    started = null;
                    if ("RESOLVED".equals(event.kind())) resolvedAt = at;
                }
                case "REQUESTER_REPLY" -> {
                    if (started == null && resolvedAt == null) started = at;
                }
                case "REOPENED" -> {
                    started = at;
                    resolvedAt = null;
                }
                default -> { }
            }
        }
        if (started != null) active.add(new FirstReplySla.WorkPeriod(started, now));

        Duration used = Duration.ZERO;
        Instant dueAt = null;
        for (FirstReplySla.WorkPeriod interval : active) {
            Duration elapsed = FirstReplySla.workingTime(interval.start(), interval.end());
            Duration remaining = target.minus(used);
            if (dueAt == null && elapsed.compareTo(remaining) >= 0) {
                dueAt = endOfBudget(interval.start(), remaining);
            }
            used = used.plus(elapsed);
        }

        Duration remaining = target.minus(used);
        boolean exceeded = remaining.isNegative();
        State state;
        if (resolvedAt != null) state = exceeded ? State.LATE : State.ON_TIME;
        else if (started == null) state = State.PAUSED;
        else state = exceeded ? State.OVERDUE : State.ACTIVE;

        if (dueAt == null && state == State.ACTIVE) dueAt = endOfBudget(now, remaining);
        if (dueAt == null && resolvedAt != null && !active.isEmpty() && active.getLast().end().equals(resolvedAt)) {
            dueAt = endOfBudget(resolvedAt, remaining);
        }
        long minutesLeft = exceeded ? 0 : remaining.toMinutes();
        if (!exceeded && !remaining.minusMinutes(minutesLeft).isZero()) minutesLeft++;
        return new ResolutionSla(state, target.toMinutes(), used.toMinutes(), minutesLeft,
                state == State.PAUSED ? null : dueAt, resolvedAt);
    }

    private static Instant endOfBudget(Instant start, Duration remaining) {
        return FirstReplySla.deadlinePeriods(start, remaining).getLast().end();
    }

    enum State { ACTIVE, PAUSED, OVERDUE, ON_TIME, LATE }
}
