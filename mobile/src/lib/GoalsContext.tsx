import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { adjustPlanWithAI } from "./ai";
import { deleteGoalRow, kvGet, kvSet, loadGoals, saveGoal } from "./db";
import {
  checkIn as checkInLogic,
  CheckInResult,
  createInitialGoal,
  useReviveCard as reviveLogic,
} from "./store";
import { Badge, DayTask, Goal, PersonaId } from "./types";

const PERSONA_KEY = "persona";

interface GoalsContextValue {
  goals: Goal[];
  activeGoals: Goal[];
  persona: PersonaId;
  setPersona: (p: PersonaId) => void;
  addGoal: (name: string, totalDays: number, tasks: DayTask[]) => Goal;
  checkIn: (goalId: string, dayIndex: number) => CheckInResult | null;
  revive: (goalId: string) => Goal | null;
  adjustPlan: (goalId: string) => Promise<string>;
  removeGoal: (goalId: string) => void;
  updateGoal: (goal: Goal) => void;
  addReviveCard: (goalId: string, n: number) => void;
}

const GoalsContext = createContext<GoalsContextValue | null>(null);

function loadSavedPersona(): PersonaId {
  const saved = kvGet(PERSONA_KEY);
  if (saved === "gentle" || saved === "strict" || saved === "rational") {
    return saved;
  }
  return "gentle";
}

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>(() => loadGoals());
  const [persona, setPersonaState] = useState<PersonaId>(() => loadSavedPersona());

  const setPersona = useCallback((p: PersonaId) => {
    setPersonaState(p);
    kvSet(PERSONA_KEY, p);
  }, []);

  const persist = useCallback((goal: Goal) => {
    saveGoal(goal);
    setGoals((prev) => {
      const idx = prev.findIndex((g) => g.id === goal.id);
      if (idx === -1) return [...prev, goal];
      const next = [...prev];
      next[idx] = goal;
      return next;
    });
  }, []);

  const addGoal = useCallback(
    (name: string, totalDays: number, tasks: DayTask[]): Goal => {
      const goal = createInitialGoal(name, "", totalDays, tasks);
      persist(goal);
      return goal;
    },
    [persist]
  );

  const checkIn = useCallback(
    (goalId: string, dayIndex: number): CheckInResult | null => {
      const goal = loadGoals().find((g) => g.id === goalId);
      if (!goal) return null;
      const result = checkInLogic(goal, dayIndex);
      persist(result.goal);
      return result;
    },
    [persist]
  );

  const revive = useCallback(
    (goalId: string): Goal | null => {
      const goal = loadGoals().find((g) => g.id === goalId);
      if (!goal) return null;
      const updated = reviveLogic(goal);
      if (updated) persist(updated);
      return updated;
    },
    [persist]
  );

  const adjustPlan = useCallback(
    async (goalId: string): Promise<string> => {
      const goal = loadGoals().find((g) => g.id === goalId);
      if (!goal) throw new Error("目标不存在");
      const result = await adjustPlanWithAI(goal);
      persist({
        ...goal,
        tasks: result.tasks,
        totalDays: result.tasks.length,
        adjustCount: (goal.adjustCount || 0) + 1,
        lastAdjustedAt: new Date().toISOString(),
      });
      return result.message;
    },
    [persist]
  );

  const removeGoal = useCallback((goalId: string) => {
    deleteGoalRow(goalId);
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
  }, []);

  const updateGoal = useCallback(
    (goal: Goal) => {
      persist(goal);
    },
    [persist]
  );

  const addReviveCard = useCallback(
    (goalId: string, n: number) => {
      const goal = loadGoals().find((g) => g.id === goalId);
      if (!goal) return;
      persist({ ...goal, reviveCards: goal.reviveCards + n });
    },
    [persist]
  );

  const value = useMemo<GoalsContextValue>(
    () => ({
      goals,
      activeGoals: goals.filter((g) => g.status === "active"),
      persona,
      setPersona,
      addGoal,
      checkIn,
      revive,
      adjustPlan,
      removeGoal,
      updateGoal,
      addReviveCard,
    }),
    [goals, persona, setPersona, addGoal, checkIn, revive, adjustPlan, removeGoal, updateGoal, addReviveCard]
  );

  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
}

export function useGoals(): GoalsContextValue {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error("useGoals must be used within GoalsProvider");
  return ctx;
}

export type { Badge };
