package com.itservicedesk.incident;

import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

record FirstReplySla(Instant dueAt, Instant firstReplyAt, State state, long minutes, List<WorkPeriod> periods) {
    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final LocalTime OPEN = LocalTime.of(8, 0);
    private static final LocalTime CLOSE = LocalTime.of(17, 0);
    private static final Duration RESPONSE_TARGET = Duration.ofHours(2);
    private static final long SOON_MINUTES = 30;

    static FirstReplySla evaluate(OffsetDateTime createdAt, OffsetDateTime firstReplyAt, Instant now) {
        List<WorkPeriod> periods = deadlinePeriods(createdAt.toInstant(), RESPONSE_TARGET);
        Instant due = periods.getLast().end();
        if (firstReplyAt != null) {
            Instant reply = firstReplyAt.toInstant();
            boolean late = reply.isAfter(due);
            long difference = late ? workingTime(due, reply).toMinutes() : workingTime(reply, due).toMinutes();
            return new FirstReplySla(due, reply, late ? State.LATE : State.ON_TIME, difference, periods);
        }
        if (now.isAfter(due)) {
            return new FirstReplySla(due, null, State.OVERDUE, workingTime(due, now).toMinutes(), periods);
        }
        Duration remaining = workingTime(now, due);
        long minutes = remaining.toMinutes();
        if (!remaining.minusMinutes(minutes).isZero()) minutes++;
        return new FirstReplySla(due, null, minutes <= SOON_MINUTES ? State.DUE_SOON : State.PENDING, minutes, periods);
    }

    static List<WorkPeriod> deadlinePeriods(Instant created, Duration remaining) {
        LocalDate day = created.atZone(ZONE).toLocalDate();
        List<WorkPeriod> periods = new ArrayList<>();
        while (!remaining.isZero()) {
            Instant start = later(created, at(day, OPEN));
            Instant close = at(day, CLOSE);
            if (isWorkingDay(day) && start.isBefore(close)) {
                Duration available = Duration.between(start, close);
                Duration used = available.compareTo(remaining) < 0 ? available : remaining;
                periods.add(new WorkPeriod(start, start.plus(used)));
                remaining = remaining.minus(used);
            }
            day = day.plusDays(1);
        }
        return List.copyOf(periods);
    }

    static Duration workingTime(Instant start, Instant end) {
        if (!start.isBefore(end)) return Duration.ZERO;
        LocalDate first = start.atZone(ZONE).toLocalDate();
        LocalDate last = end.atZone(ZONE).toLocalDate();
        if (first.equals(last)) return overlap(first, start, end);

        Duration total = overlap(first, start, end).plus(overlap(last, start, end));
        LocalDate middle = first.plusDays(1);
        long days = ChronoUnit.DAYS.between(middle, last);
        long workdays = days / 7 * 5;
        for (long index = 0; index < days % 7; index++) {
            if (isWorkingDay(middle.plusDays(index))) workdays++;
        }
        return total.plus(Duration.between(OPEN, CLOSE).multipliedBy(workdays));
    }

    private static Duration overlap(LocalDate day, Instant start, Instant end) {
        if (!isWorkingDay(day)) return Duration.ZERO;
        Instant startInShift = later(start, at(day, OPEN));
        Instant close = at(day, CLOSE);
        Instant endInShift = end.isBefore(close) ? end : close;
        return startInShift.isBefore(endInShift) ? Duration.between(startInShift, endInShift) : Duration.ZERO;
    }

    private static Instant at(LocalDate day, LocalTime time) {
        return day.atTime(time).atZone(ZONE).toInstant();
    }

    private static Instant later(Instant first, Instant second) {
        return first.isAfter(second) ? first : second;
    }

    private static boolean isWorkingDay(LocalDate day) {
        return day.getDayOfWeek() != DayOfWeek.SATURDAY && day.getDayOfWeek() != DayOfWeek.SUNDAY;
    }

    record WorkPeriod(Instant start, Instant end) {}

    enum State { PENDING, DUE_SOON, OVERDUE, ON_TIME, LATE }
}
