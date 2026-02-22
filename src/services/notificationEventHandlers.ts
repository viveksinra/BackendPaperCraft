import * as notificationService from "./notificationService";
import { logger } from "../shared/logger";

// ─── Centralized handlers for creating notifications from platform events ──
// Services across phases call these handlers to emit notifications.

export async function onHomeworkAssigned(params: {
  tenantId: string;
  companyId: string;
  recipientIds: string[];
  homeworkTitle: string;
  homeworkId: string;
  dueDate?: string;
}): Promise<void> {
  try {
    await notificationService.createBulkNotifications(
      params.recipientIds.map((recipientId) => ({
        tenantId: params.tenantId,
        companyId: params.companyId,
        recipientId,
        type: "homework_assigned" as const,
        title: "New Homework",
        body: `You have new homework: "${params.homeworkTitle}"${params.dueDate ? ` (due ${params.dueDate})` : ""}`,
        actionUrl: `/student/homework/${params.homeworkId}`,
        referenceType: "homework",
        referenceId: params.homeworkId,
      }))
    );
  } catch (err) {
    logger.warn({ msg: "Failed to create homework assigned notifications", err });
  }
}

export async function onHomeworkGraded(params: {
  tenantId: string;
  companyId: string;
  recipientId: string;
  homeworkTitle: string;
  homeworkId: string;
  grade: string;
}): Promise<void> {
  try {
    await notificationService.createNotification({
      tenantId: params.tenantId,
      companyId: params.companyId,
      recipientId: params.recipientId,
      type: "homework_graded",
      title: "Homework Graded",
      body: `Your homework "${params.homeworkTitle}" has been graded: ${params.grade}`,
      actionUrl: `/student/homework/${params.homeworkId}`,
      referenceType: "homework",
      referenceId: params.homeworkId,
    });
  } catch (err) {
    logger.warn({ msg: "Failed to create homework graded notification", err });
  }
}

export async function onTestScheduled(params: {
  tenantId: string;
  companyId: string;
  recipientIds: string[];
  testTitle: string;
  testId: string;
  scheduledDate?: string;
}): Promise<void> {
  try {
    await notificationService.createBulkNotifications(
      params.recipientIds.map((recipientId) => ({
        tenantId: params.tenantId,
        companyId: params.companyId,
        recipientId,
        type: "test_scheduled" as const,
        title: "Test Scheduled",
        body: `A new test has been scheduled: "${params.testTitle}"${params.scheduledDate ? ` on ${params.scheduledDate}` : ""}`,
        actionUrl: `/student/tests`,
        referenceType: "online_test",
        referenceId: params.testId,
      }))
    );
  } catch (err) {
    logger.warn({ msg: "Failed to create test scheduled notifications", err });
  }
}

export async function onTestGraded(params: {
  tenantId: string;
  companyId: string;
  recipientId: string;
  testTitle: string;
  testId: string;
  score: number;
}): Promise<void> {
  try {
    await notificationService.createNotification({
      tenantId: params.tenantId,
      companyId: params.companyId,
      recipientId: params.recipientId,
      type: "test_graded",
      title: "Test Results Available",
      body: `Your results for "${params.testTitle}" are ready. Score: ${params.score}%`,
      actionUrl: `/student/results`,
      referenceType: "online_test",
      referenceId: params.testId,
    });
  } catch (err) {
    logger.warn({ msg: "Failed to create test graded notification", err });
  }
}

export async function onFeeReminder(params: {
  tenantId: string;
  companyId: string;
  recipientId: string;
  amount: number;
  currency: string;
  dueDate: string;
}): Promise<void> {
  try {
    await notificationService.createNotification({
      tenantId: params.tenantId,
      companyId: params.companyId,
      recipientId: params.recipientId,
      type: "fee_reminder",
      title: "Fee Reminder",
      body: `You have an outstanding fee of ${params.currency} ${params.amount} due on ${params.dueDate}`,
      priority: "high",
      actionUrl: `/student/fees`,
      referenceType: "fee",
      referenceId: "",
    });
  } catch (err) {
    logger.warn({ msg: "Failed to create fee reminder notification", err });
  }
}

export async function onPaymentReceived(params: {
  tenantId: string;
  companyId: string;
  recipientId: string;
  amount: number;
  currency: string;
  productName: string;
  purchaseId: string;
}): Promise<void> {
  try {
    await notificationService.createNotification({
      tenantId: params.tenantId,
      companyId: params.companyId,
      recipientId: params.recipientId,
      type: "payment_received",
      title: "Payment Confirmed",
      body: `Your payment of ${params.currency} ${params.amount} for "${params.productName}" has been confirmed`,
      actionUrl: `/student/purchases`,
      referenceType: "purchase",
      referenceId: params.purchaseId,
    });
  } catch (err) {
    logger.warn({ msg: "Failed to create payment notification", err });
  }
}

export async function onCourseEnrolled(params: {
  tenantId: string;
  companyId: string;
  recipientId: string;
  courseTitle: string;
  courseId: string;
}): Promise<void> {
  try {
    await notificationService.createNotification({
      tenantId: params.tenantId,
      companyId: params.companyId,
      recipientId: params.recipientId,
      type: "course_enrolled",
      title: "Course Enrolled",
      body: `You've been enrolled in "${params.courseTitle}"`,
      actionUrl: `/student/my-courses`,
      referenceType: "course",
      referenceId: params.courseId,
    });
  } catch (err) {
    logger.warn({ msg: "Failed to create course enrollment notification", err });
  }
}

export async function onCourseCompleted(params: {
  tenantId: string;
  companyId: string;
  recipientId: string;
  courseTitle: string;
  courseId: string;
}): Promise<void> {
  try {
    await notificationService.createNotification({
      tenantId: params.tenantId,
      companyId: params.companyId,
      recipientId: params.recipientId,
      type: "course_completed",
      title: "Course Completed!",
      body: `Congratulations! You've completed "${params.courseTitle}"`,
      icon: "award",
      actionUrl: `/student/certificates`,
      referenceType: "course",
      referenceId: params.courseId,
    });
  } catch (err) {
    logger.warn({ msg: "Failed to create course completion notification", err });
  }
}

export async function onAnnouncementPosted(params: {
  tenantId: string;
  companyId: string;
  recipientIds: string[];
  announcementTitle: string;
  announcementId: string;
}): Promise<void> {
  try {
    await notificationService.createBulkNotifications(
      params.recipientIds.map((recipientId) => ({
        tenantId: params.tenantId,
        companyId: params.companyId,
        recipientId,
        type: "announcement_posted" as const,
        title: "New Announcement",
        body: params.announcementTitle,
        actionUrl: `/student/announcements`,
        referenceType: "announcement",
        referenceId: params.announcementId,
      }))
    );
  } catch (err) {
    logger.warn({ msg: "Failed to create announcement notifications", err });
  }
}
