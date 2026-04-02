"use client";

import { useState, useEffect, useCallback } from "react";
import { Goal } from "@/lib/types";

interface NotificationData {
  title: string;
  body: string;
  timestamp: number;
}

const NOTIFICATION_STORAGE_KEY = "zhuri_notifications";
const LAST_CHECK_DATE_KEY = "zhuri_last_check_date";
const STREAK_WARNING_SHOWN_KEY = "zhuri_streak_warning_shown";

// Request notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

// Check if notifications are enabled
export function isNotificationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return Notification.permission === "granted";
}

// Send a notification
export function sendNotification(title: string, body: string): void {
  if (!isNotificationEnabled()) return;

  try {
    const notification = new Notification(title, {
      body,
      icon: "/icon.png",
      tag: "zhuri-reminder",
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // Auto close after 10 seconds
    setTimeout(() => notification.close(), 10000);
  } catch (error) {
    console.error("Failed to send notification:", error);
  }
}

// Store notification history
function saveNotification(notification: NotificationData): void {
  const existing = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]");
  existing.push(notification);
  localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(existing));
}

// Get notification history
export function getNotificationHistory(): NotificationData[] {
  return JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]");
}

// Clear old notifications (older than 7 days)
export function clearOldNotifications(): void {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const existing: NotificationData[] = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]");
  const filtered = existing.filter((n) => n.timestamp > sevenDaysAgo);
  localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(filtered));
}

// Main reminder hook
export function useGoalReminders(activeGoal: Goal | null) {
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    setPermissionGranted(isNotificationEnabled());
  }, []);

  const checkAndRemind = useCallback(() => {
    if (!activeGoal) return;

    const today = new Date().toISOString().split("T")[0];
    const todayTasks = activeGoal.tasks.filter((t) => t.date === today);
    const allCompleted = todayTasks.length > 0 && todayTasks.every((t) => t.completed);
    const currentHour = new Date().getHours();

    // If it's past 9 PM and not completed
    if (currentHour >= 21 && !allCompleted) {
      // Don't notify if already shown today
      const warningShown = localStorage.getItem(`${STREAK_WARNING_SHOWN_KEY}_${today}`);
      if (!warningShown) {
        sendNotification(
          "🔥 逐日 - 打卡提醒",
          "今天还剩不到3小时，你的连续天数危险了！"
        );
        localStorage.setItem(`${STREAK_WARNING_SHOWN_KEY}_${today}`, "true");
      }
    }

    // If it's past 11 PM and not completed - final warning
    if (currentHour >= 23 && !allCompleted) {
      const finalWarningShown = localStorage.getItem(`final_warning_${today}`);
      if (!finalWarningShown) {
        sendNotification(
          "⚠️ 逐日 - 最后机会",
          "今天即将结束，明天你的连续天数将归零！"
        );
        localStorage.setItem(`final_warning_${today}`, "true");
      }
    }
  }, [activeGoal]);

  // Run check every hour
  useEffect(() => {
    if (!activeGoal) return;

    // Initial check
    checkAndRemind();

    // Set up interval
    const interval = setInterval(checkAndRemind, 60 * 60 * 1000); // Every hour

    return () => clearInterval(interval);
  }, [activeGoal, checkAndRemind]);

  return { permissionGranted };
}

// Request permission handler
export async function handleRequestPermission(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  return granted;
}
