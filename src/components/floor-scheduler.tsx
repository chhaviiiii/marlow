"use client";

import { BryntumScheduler } from "@bryntum/scheduler-react";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";
import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/svalbard-light.css";
import { RESOURCES } from "@/lib/catalog";
import type { FloorEvent } from "@/lib/types";
import { useMedia } from "./use-media";

export default function FloorScheduler({ events, tall = false }: { events: FloorEvent[]; tall?: boolean }) {
  const compact = useMedia("(max-width: 860px), (max-height: 560px)");
  const data = events.map((event) => ({
    id: event.id,
    resourceId: event.resourceId,
    name: event.name,
    startDate: event.start,
    endDate: event.end,
    cls: `is-${event.status}`,
  }));

  return (
    <div className="scheduler marlow-floor" style={{ height: tall ? "100%" : 268 }}>
      <BryntumScheduler
        key={compact ? "compact" : "wide"}
        timeZone="America/Chicago"
        startDate={new Date("2026-10-05T00:00:00-05:00")}
        endDate={new Date("2026-10-10T00:00:00-05:00")}
        workingTime={{ fromDay: 1, toDay: 6, fromHour: 7, toHour: 19 }}
        viewPreset="dayAndWeek"
        forceFit={!compact}
        autoHeight={compact}
        eventLayout="pack"
        rowHeight={tall ? 108 : 64}
        barMargin={8}
        events={data}
        resources={[...RESOURCES]}
        columns={
          compact
            ? [{ text: "Station", field: "name", width: 104 }]
            : [
                { text: "Station", field: "name", width: tall ? 130 : 110 },
                { text: "Work", field: "role", width: tall ? 120 : 100 },
              ]
        }
        eventStyle="filled"
        eventColor="teal"
        readOnly
      />
    </div>
  );
}
