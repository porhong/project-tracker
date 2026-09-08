"use client";

import { useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import {
  HelpCircleIcon,
  MessageSquareTextIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type {
  ClientRetrospectiveUserGroup,
  ClientSprint,
  ClientSprintRetrospectiveQuestion,
} from "../types";
import {
  SprintRetrospectiveForm,
  type RetrospectiveAnswerItem,
} from "../../my-sprint-activity/_components/sprint-retrospective-form";

type Props = {
  sprint: ClientSprint;
  questions: ClientSprintRetrospectiveQuestion[];
  userGroups: ClientRetrospectiveUserGroup[];
  activityScope?: "own" | "team";
  canSubmit?: boolean;
  currentUserId?: string;
  myAnswers?: RetrospectiveAnswerItem[];
};

function formatTimestamp(isoString: string) {
  const date = parseISO(isoString);
  if (!isValid(date)) return isoString;
  return format(date, "MMM d, yyyy · h:mm a");
}

export function SprintRetrospectiveViewer({
  sprint,
  questions,
  userGroups,
  canSubmit = false,
  myAnswers = [],
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>("all");

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.order_index - b.order_index),
    [questions],
  );

  const filteredGroups = useMemo(() => {
    if (selectedUserId === "all") return userGroups;
    return userGroups.filter((group) => group.userId === selectedUserId);
  }, [userGroups, selectedUserId]);

  if (sortedQuestions.length === 0) {
    return (
      <Alert>
        <HelpCircleIcon />
        <AlertDescription>
          No retrospective questions have been configured for Sprint #{sprint.sprint_number} yet.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MessageSquareTextIcon className="size-5 text-primary" />
                <CardTitle>
                  Sprint #{sprint.sprint_number} Retrospective
                </CardTitle>
              </div>
              <CardDescription>
                {sprint.version} · {sprint.start_date} — {sprint.end_date}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <UsersIcon data-icon="inline-start" />
                {userGroups.length} {userGroups.length === 1 ? "contributor" : "contributors"}
              </Badge>
              <Badge variant="outline">
                {sortedQuestions.length} {sortedQuestions.length === 1 ? "question" : "questions"}
              </Badge>
            </div>
          </div>
        </CardHeader>

        {userGroups.length > 1 ? (
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <span className="text-xs font-medium text-muted-foreground mr-1">
                Filter by member:
              </span>
              <Button
                variant={selectedUserId === "all" ? "secondary" : "ghost"}
                size="xs"
                onClick={() => setSelectedUserId("all")}
              >
                All members ({userGroups.length})
              </Button>
              {userGroups.map((group) => (
                <Button
                  key={group.userId}
                  variant={selectedUserId === group.userId ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setSelectedUserId(group.userId)}
                >
                  {group.memberName}
                </Button>
              ))}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {canSubmit ? (
        <SprintRetrospectiveForm
          key={sprint.id}
          sprintId={sprint.id}
          sprintStatus={sprint.status}
          canEdit={true}
          questions={sortedQuestions}
          initialAnswers={myAnswers}
          title="My Sprint Retrospective"
          description={`Share your reflections and feedback on how the team delivered Sprint #${sprint.sprint_number}. Your responses are visible to project members.`}
        />
      ) : null}

      {userGroups.length === 0 ? (
        canSubmit ? (
          <Alert>
            <UserCheckIcon />
            <AlertDescription>
              No team member responses have been recorded yet for Sprint #{sprint.sprint_number}. Share your reflections above!
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <Alert>
              <UserCheckIcon />
              <AlertDescription>
                No team members have submitted retrospective responses for Sprint #{sprint.sprint_number} yet.
              </AlertDescription>
            </Alert>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Configured Questions</CardTitle>
                <CardDescription>
                  Questions awaiting member feedback for this sprint:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  {sortedQuestions.map((q) => (
                    <li key={q.id}>
                      <span className="font-medium">{q.question}</span>
                      {q.description ? (
                        <p className="text-xs text-muted-foreground ml-5 mt-0.5">{q.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {canSubmit ? (
            <div className="flex items-center justify-between pt-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Team Reflections ({userGroups.length})
              </h3>
            </div>
          ) : null}
          {filteredGroups.map((group) => (
            <Card key={group.userId} className="overflow-hidden">
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ProfileAvatar
                      name={group.memberName}
                      url={group.avatarUrl}
                      className="size-10"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{group.memberName}</CardTitle>
                        {group.competency ? (
                          <Badge variant="outline" className="text-xs">
                            {group.competency}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Last updated {formatTimestamp(group.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <Badge variant="secondary" className="text-xs">
                    {group.answers.length} of {sortedQuestions.length} answered
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-5 space-y-5">
                {sortedQuestions.map((q, qIndex) => {
                  const answer = group.answers.find((a) => a.questionId === q.id);
                  return (
                    <div key={q.id} className="space-y-2">
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Question #{qIndex + 1}
                        </p>
                        <p className="text-sm font-medium text-foreground">{q.question}</p>
                      </div>

                      {answer?.content ? (
                        <div className="rounded-xl border bg-card/60 p-3.5">
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                            {answer.content}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">
                          No response provided.
                        </p>
                      )}

                      {qIndex < sortedQuestions.length - 1 ? (
                        <Separator className="mt-4" />
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
