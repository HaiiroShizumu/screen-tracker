import { useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { enUS } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  value: string; // YYYY-MM-DD
  onChange: (day: string) => void;
  className?: string;
};

export function DatePicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    try {
      return parse(value, "yyyy-MM-dd", new Date());
    } catch {
      return undefined;
    }
  }, [value]);

  const label = selected
    ? format(selected, "MMMM do, yyyy", { locale: enUS })
    : "Pick a date";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "min-w-[11.5rem] justify-start font-normal",
            !selected && "text-[var(--color-muted-foreground)]",
            className
          )}
        >
          <CalendarIcon className="size-4 opacity-70" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
