import type { ComponentProps } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type DayPickerProps,
} from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

export type CalendarProps = DayPickerProps;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  formatters,
  components,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn(
        "group/calendar bg-[var(--color-popover)] p-3 [--cell-size:2rem]",
        className
      )}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("relative flex flex-col gap-4", defaultClassNames.months),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          "inline-flex size-[var(--cell-size)] items-center justify-center rounded-lg p-0 select-none aria-disabled:opacity-50",
          "hover:bg-[var(--color-muted)]",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          "inline-flex size-[var(--cell-size)] items-center justify-center rounded-lg p-0 select-none aria-disabled:opacity-50",
          "hover:bg-[var(--color-muted)]",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-[var(--cell-size)] w-full items-center justify-center px-[var(--cell-size)]",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "text-sm font-medium select-none",
          defaultClassNames.caption_label
        ),
        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 rounded-md text-[0.8rem] font-normal text-[var(--color-muted-foreground)] select-none",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        day: cn(
          "group/day relative aspect-square h-full w-full p-0 text-center select-none",
          defaultClassNames.day
        ),
        today: cn(
          "rounded-md bg-[var(--color-muted)] text-[var(--color-foreground)]",
          defaultClassNames.today
        ),
        outside: cn(
          "text-[var(--color-muted-foreground)] opacity-50",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-[var(--color-muted-foreground)] opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return (
            <Icon className={cn("size-4", chevronClass)} {...chevronProps} />
          );
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames();
  return (
    <Button
      variant="ghost"
      size="sm"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      className={cn(
        "flex aspect-square size-auto w-full min-w-[var(--cell-size)] flex-col gap-0.5 rounded-md p-0 font-normal leading-none",
        "hover:bg-[var(--color-muted)]",
        "data-[selected-single=true]:bg-[var(--color-primary)] data-[selected-single=true]:text-[var(--color-primary-foreground)] data-[selected-single=true]:hover:bg-[var(--color-primary)]",
        defaultClassNames.day_button,
        className
      )}
      {...props}
    />
  );
}
