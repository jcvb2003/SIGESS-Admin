import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function MiniCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const today = new Date();

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const isToday = (day: number | null) => {
    if (!day) return false;
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const days = getDaysInMonth(currentDate);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">
          {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAYS.map((day) => (
          <div
            key={day}
            className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {days.map((day, index) => (
          <div
            key={index}
            className={cn(
              "flex h-8 items-center justify-center rounded-md text-xs transition-colors",
              day && "hover:bg-secondary cursor-pointer",
              isToday(day) && "bg-primary text-primary-foreground font-semibold",
              !day && "invisible"
            )}
          >
            {day}
          </div>
        ))}
      </div>
    </Card>
  );
}
