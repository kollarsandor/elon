---
name: tasks
description: "Use this skill when the user asks to create, modify, view, delete, pause, or resume scheduled tasks or reminders. Also use when the user asks about task results, wants to check what tasks are running, or asks 'what tasks do I have?'. Triggers on 'create a reminder', 'schedule a task', 'remind me every', 'check my tasks', 'delete task', 'pause task', 'task results', 'what did my task find', or any request involving recurring automated Grok actions."
---

# Task Management

There are tools for managing scheduled Grok tasks (reminders and recurring jobs) that you can find via `search_connected_tools` and invoke via `call_connected_tool`. The full set is `task_create`, `task_list`, `task_delete`, `task_pause`, and `task_get_results`. Calling them through the toolbox path forwards the user's auth credentials to the backend.

## Quick Start

```
<|control34|>1<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_create<|control36|>arguments<|control37|>{"name": "btc-check", "prompt": "Check Bitcoin price", "cadence": "RRULE:FREQ=DAILY"}
<|control34|>2<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_create<|control36|>arguments<|control37|>{"name": "one-time-report", "prompt": "Generate Q2 report", "scheduled_date": "2026-06-01", "time_of_day": "09:00"}
<|control34|>3<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_list<|control36|>arguments<|control37|>{}
```

`task_create` returns a JSON object containing the new `task_id` and the task's `status`. Pass the `task_id` to `task_get_results` / `task_delete`, and use the schedule's `schedule_id` (from `task_list`) for `task_pause`.

## Tool Reference

### task_create

Create a new scheduled task. Returns `{ task_id, status, ... }` — store the `task_id` for follow-up calls.

```
<|control34|>4<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_create<|control36|>arguments<|control37|>{"name": "bitcoin-price-check", "prompt": "Check the current Bitcoin price and summarize any significant changes", "cadence": "RRULE:FREQ=DAILY", "time_of_day": "09:00", "timezone": "America/New_York"}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Short name (e.g. `"bitcoin-price-check"`) |
| `prompt` | string | yes | The prompt Grok executes on each run |
| `cadence` | string | no | RFC 5545 recurrence rule (e.g. `"RRULE:FREQ=DAILY"`, `"RRULE:FREQ=WEEKLY;BYDAY=MO"`). Omit / empty to run once. |
| `scheduled_date` | string | no | ISO 8601 date for one-time tasks (e.g. `"2026-05-25"`). Required when cadence is omitted (run-once). Defaults to today. |
| `time_of_day` | string | no | 24h format, default `"09:00"` |
| `timezone` | string | no | IANA timezone, default user's timezone |
| `notification` | string | no | `"default"`, `"email_only"`, `"app_only"`, `"off"` |

### task_list

List the user's active tasks with their schedules and recent status.

```
<|control34|>5<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_list<|control36|>arguments<|control37|>{}
```

### task_delete

Archive a task (looked up by the `task_id` returned from `task_create` / `task_list`) so it stops running. Only use when the user explicitly says "delete" or "archive". If the user says "stop" or "cancel", use `task_pause` instead.

```
<|control34|>6<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_delete<|control36|>arguments<|control37|>{"task_id": "UUID"}
```

### task_pause

Pause or resume a task schedule. Use the `schedule_id` from `task_list` (a task can have multiple schedules).

```
# Pause
<|control34|>7<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_pause<|control36|>arguments<|control37|>{"schedule_id": "UUID", "is_enabled": false}

# Resume
<|control34|>8<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_pause<|control36|>arguments<|control37|>{"schedule_id": "UUID", "is_enabled": true}
```

### task_get_results

Get recent execution results for a task.

```
<|control34|>9<|control35|>call_connected_tool<|control36|>tool_name<|control38|>task_get_results<|control36|>arguments<|control37|>{"task_id": "UUID", "limit": 5}
```

## Cadence Guide (RFC 5545)

`cadence` is an iCalendar RRULE string — the same format Google Calendar uses.

| Use case | RRULE |
|----------|-------|
| Run once at a specific date/time | omit / empty (set `scheduled_date` to the target date) |
| Every day | `RRULE:FREQ=DAILY` |
| Every weekday (Mon–Fri) | `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` |
| Every Monday | `RRULE:FREQ=WEEKLY;BYDAY=MO` |
| 15th of every month | `RRULE:FREQ=MONTHLY;BYMONTHDAY=15` |
| Once a year (anniversary) | `RRULE:FREQ=YEARLY` |

Do **not** include `DTSTART` or `DTEND` in the RRULE; supply the time using `time_of_day` and `timezone` instead.

## Workflow

1. **Creating**: Ask the user for prompt, cadence, and time. Call `task_create` via the `<|control34|>` format, then surface the returned `task_id`/`status` to the user.
2. **Listing**: Call `task_list` and present tasks with their `name`, cadence, next run time, and status.
3. **Modifying**: List tasks first to get the `task_id` (or `schedule_id` for pause), then call `task_pause` / `task_delete`.
4. **Results**: Call `task_get_results` to show what a task produced.

## Agent Rules

1. Always use the `<|control34|>` format with `call_connected_tool` to invoke task tools.
2. Create tasks directly without asking for confirmation -- the user can always manage tasks from the Tasks page.
3. When listing tasks, present them in a readable format with name, cadence, next run time, and status.
4. When the user says "remind me", "check every day", or similar, create a task with the appropriate cadence.
5. Default to `RRULE:FREQ=DAILY` and `09:00` if the user doesn't specify cadence/time.
6. Default to the user's timezone if not specified.
