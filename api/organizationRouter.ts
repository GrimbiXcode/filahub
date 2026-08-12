import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { normalizeTelegramUsername } from "@contracts/friends";
import {
  MAX_MEMBERS_PER_ORGANIZATION,
  MAX_ORGANIZATIONS_PER_USER,
  joinRoleSchema,
  normalizeJoinCode,
  organizationRoleSchema,
} from "@contracts/organizations";
import { createRouter, authedQuery } from "./middleware";
import { ORGANIZATIONS_PATH, notify } from "./lib/notify";
import { resolveScope } from "./scope";
import { recordAudit } from "./queries/audit";
import {
  findUserByFriendCode,
  findUserByTelegramUsername,
} from "./queries/friends";
import {
  addMember,
  changeMembership,
  countAdminOrganizations,
  countOpenInvitations,
  createInvitation,
  createOrganization,
  deleteOrganizationIfEmpty,
  findOpenInvitation,
  findOrganization,
  findOrganizationByJoinCode,
  generateJoinCode,
  listMembers,
  listMemberships,
  listOpenInvitations,
  respondToInvitation,
  setJoinCode,
  updateOrganization,
  type MemberBlock,
} from "./queries/organizations";

/**
 * Organisationen anlegen und verwalten.
 *
 * Muster: `api/lagerRouter.ts`. Deutsche Fehlermeldungen, `NOT_FOUND` auch bei
 * fremden Zeilen (nie `FORBIDDEN` – das verriete deren Existenz), IDs als
 * `z.number().int().positive()`.
 *
 * **Eine Ausnahme von der `NOT_FOUND`-Regel, und sie ist Absicht:** Wer
 * Mitglied ist, aber die Stufe nicht reicht, bekommt `FORBIDDEN`. Er kennt die
 * Organisation ohnehin; „nicht gefunden“ wäre dort eine Lüge, die beim Suchen
 * des Fehlers kostet und nichts schützt. Entschieden wird das in
 * `resolveScope` (`api/scope.ts`), nicht hier.
 */

const idInput = z.object({
  organizationId: z.number().int().positive(),
});

const nameInput = z.string().trim().min(1, "Name ist erforderlich").max(255);

/** Übersetzt die Absagegründe aus `queries/organizations.ts` in Meldungen. */
function assertNotBlocked(block: MemberBlock | null): void {
  if (block === null) return;
  if (block === "last_admin") {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Die Organisation braucht mindestens einen Administrator. Ernenne zuerst jemand anderen.",
    });
  }
  if (block === "full") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Mehr als ${MAX_MEMBERS_PER_ORGANIZATION} Mitglieder sind derzeit nicht möglich.`,
    });
  }
  if (block === "duplicate") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Diese Person ist bereits Mitglied.",
    });
  }
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Mitglied nicht gefunden",
  });
}

export const organizationRouter = createRouter({
  /** Meine Organisationen samt eigener Stufe – Grundlage des Umschalters. */
  list: authedQuery.query(({ ctx }) => listMemberships(ctx.user.id)),

  create: authedQuery
    .input(z.object({ name: nameInput }))
    .mutation(async ({ ctx, input }) => {
      /*
        Obergrenze wie bei den Lagern, mit demselben Vorbehalt: Ein Zähler ist
        weder als Unique- noch als partieller Index ausdrückbar, zwei
        gleichzeitige Anfragen können eine Organisation zu viel erzeugen.
      */
      const existing = await countAdminOrganizations(ctx.user.id);
      if (existing >= MAX_ORGANIZATIONS_PER_USER) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Mehr als ${MAX_ORGANIZATIONS_PER_USER} eigene Organisationen sind derzeit nicht möglich.`,
        });
      }
      const org = await createOrganization(ctx.user.id, input.name);
      recordAudit({
        event: "organization.created",
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
        detail: { organizationId: org.id },
      });
      return org;
    }),

  /**
   * Stammdaten und Mitgliederliste.
   *
   * Ab `viewer`: Wer in einer Werkstatt am Bestand arbeitet, soll sehen, mit
   * wem. Der Beitrittscode geht nur an Administratoren hinaus – er ist ein
   * Zugangsmittel, kein Stammdatum.
   */
  get: authedQuery.input(idInput).query(async ({ ctx, input }) => {
    const scope = await resolveScope(
      ctx.user.id,
      input.organizationId,
      "viewer"
    );
    if (scope.kind !== "organization") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Kein Bereich" });
    }
    const org = await findOrganization(scope.organizationId);
    if (!org) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Organisation nicht gefunden",
      });
    }
    const members = await listMembers(scope.organizationId);
    return {
      id: org.id,
      name: org.name,
      notes: org.notes,
      joinRole: org.joinRole,
      role: scope.role,
      members,
      joinCode: scope.role === "admin" ? org.joinCode : null,
    };
  }),

  update: authedQuery
    .input(
      idInput.extend({
        name: nameInput.optional(),
        joinRole: joinRoleSchema.optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, ...data } = input;
      await resolveScope(ctx.user.id, organizationId, "admin");
      const updated = await updateOrganization(organizationId, data);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation nicht gefunden",
        });
      }
      return updated;
    }),

  /** Löschen nur, wenn kein Lager mehr daran hängt – wie beim Lager selbst. */
  delete: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    await resolveScope(ctx.user.id, input.organizationId, "admin");
    const { blockedBy } = await deleteOrganizationIfEmpty(input.organizationId);
    if (blockedBy != null) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `An dieser Organisation hängen noch ${blockedBy} Lager. Lösche sie zuerst.`,
      });
    }
    recordAudit({
      event: "organization.deleted",
      actorUserId: ctx.user.id,
      ip: ctx.clientIp,
      detail: { organizationId: input.organizationId },
    });
    return { ok: true };
  }),

  // -------------------------------------------------------------------------
  // Offener Beitritt
  // -------------------------------------------------------------------------

  /** Neuen Code erzeugen (`enabled`) oder den offenen Beitritt abschalten. */
  setJoinCode: authedQuery
    .input(idInput.extend({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await resolveScope(ctx.user.id, input.organizationId, "admin");
      const code = input.enabled
        ? await setJoinCode(input.organizationId, generateJoinCode())
        : await setJoinCode(input.organizationId, null);
      recordAudit({
        event: "organization.join_code_rotated",
        actorUserId: ctx.user.id,
        ip: ctx.clientIp,
        detail: {
          organizationId: input.organizationId,
          enabled: input.enabled,
        },
      });
      return { joinCode: code };
    }),

  joinByCode: authedQuery
    .input(z.object({ code: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const normalized = normalizeJoinCode(input.code);
      const org = normalized
        ? await findOrganizationByJoinCode(normalized)
        : undefined;
      /*
        Ungültiger und unbekannter Code bekommen dieselbe Meldung. Sie zu
        unterscheiden hieße zu verraten, welche Codes vergeben sind – und der
        Code ist das einzige, was den Beitritt schützt.
      */
      if (!org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Zu diesem Beitrittscode gibt es keine Organisation.",
        });
      }
      assertNotBlocked(
        await addMember(
          org.id,
          ctx.user.id,
          org.joinRole,
          MAX_MEMBERS_PER_ORGANIZATION
        )
      );
      recordAudit({
        event: "organization.member_added",
        actorUserId: ctx.user.id,
        subjectUserId: ctx.user.id,
        ip: ctx.clientIp,
        detail: { organizationId: org.id, role: org.joinRole, via: "code" },
      });
      return { organizationId: org.id, name: org.name, role: org.joinRole };
    }),

  // -------------------------------------------------------------------------
  // Gezielte Einladung
  // -------------------------------------------------------------------------

  /**
   * Lädt eine bestimmte Person ein – über ihren Freundescode oder ihren
   * Telegram-Benutzernamen.
   *
   * Beide Nachschlagewege kommen aus `api/queries/friends.ts`; eine zweite
   * Fassung derselben Suche wäre eine zweite Stelle, an der sie zu weit greifen
   * könnte. Wirksam wird die Einladung erst mit dem Annehmen: Niemand landet
   * ohne sein Zutun in einer Organisation.
   */
  invite: authedQuery
    .input(
      idInput.extend({
        code: z.string().max(32).optional(),
        telegramUsername: z.string().max(64).optional(),
        role: organizationRoleSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await resolveScope(ctx.user.id, input.organizationId, "admin");

      const byCode = input.code ? await findUserByFriendCode(input.code) : null;
      const username = input.telegramUsername
        ? normalizeTelegramUsername(input.telegramUsername)
        : null;
      const byName = username
        ? await findUserByTelegramUsername(username)
        : null;
      const target = byCode ?? byName;
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Zu dieser Angabe gibt es kein Konto.",
        });
      }
      if (target.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Du bist bereits Mitglied.",
        });
      }
      if (await findOpenInvitation(input.organizationId, target.id)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Für diese Person ist schon eine Einladung offen.",
        });
      }

      const invitation = await createInvitation({
        organizationId: input.organizationId,
        invitedUserId: target.id,
        invitedByUserId: ctx.user.id,
        role: input.role,
      });
      recordAudit({
        event: "organization.invited",
        actorUserId: ctx.user.id,
        subjectUserId: target.id,
        ip: ctx.clientIp,
        detail: { organizationId: input.organizationId, role: input.role },
      });
      /*
        `notified` wandert bis in die Oberfläche: Telegram lässt einen Bot nur
        schreiben, wenn der Empfänger den Chat einmal geöffnet hat. Wer sich nur
        über das Login-Widget angemeldet hat, sieht die Einladung erst beim
        nächsten Besuch – das soll der Einladende wissen, statt auf eine Antwort
        zu warten, die nie kommt.
      */
      const org = await findOrganization(input.organizationId);
      const notified = await notify(
        target.id,
        m =>
          m.organizationInvited({
            organization: org?.name ?? "",
            role: input.role,
          }),
        ORGANIZATIONS_PATH
      );
      return { id: invitation.id, name: target.name, notified };
    }),

  listInvitations: authedQuery.query(({ ctx }) =>
    listOpenInvitations(ctx.user.id)
  ),

  pendingCount: authedQuery.query(({ ctx }) =>
    countOpenInvitations(ctx.user.id)
  ),

  respondToInvitation: authedQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        accept: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const answered = await respondToInvitation(
        input.id,
        ctx.user.id,
        input.accept ? "accepted" : "declined"
      );
      if (!answered) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Einladung nicht gefunden",
        });
      }
      if (!input.accept) {
        recordAudit({
          event: "organization.invite_declined",
          actorUserId: ctx.user.id,
          ip: ctx.clientIp,
          detail: { organizationId: answered.organizationId },
        });
        return { joined: false };
      }
      assertNotBlocked(
        await addMember(
          answered.organizationId,
          ctx.user.id,
          answered.role,
          MAX_MEMBERS_PER_ORGANIZATION
        )
      );
      recordAudit({
        event: "organization.member_added",
        actorUserId: ctx.user.id,
        subjectUserId: ctx.user.id,
        ip: ctx.clientIp,
        detail: {
          organizationId: answered.organizationId,
          role: answered.role,
          via: "invitation",
        },
      });
      return { joined: true, organizationId: answered.organizationId };
    }),

  // -------------------------------------------------------------------------
  // Stufen und Austritt
  // -------------------------------------------------------------------------

  setMemberRole: authedQuery
    .input(
      idInput.extend({
        userId: z.number().int().positive(),
        role: organizationRoleSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await resolveScope(ctx.user.id, input.organizationId, "admin");
      assertNotBlocked(
        await changeMembership(input.organizationId, input.userId, input.role)
      );
      recordAudit({
        event: "organization.member_role_changed",
        actorUserId: ctx.user.id,
        subjectUserId: input.userId,
        ip: ctx.clientIp,
        detail: { organizationId: input.organizationId, role: input.role },
      });
      const org = await findOrganization(input.organizationId);
      await notify(
        input.userId,
        m =>
          m.organizationRoleChanged({
            organization: org?.name ?? "",
            role: input.role,
          }),
        ORGANIZATIONS_PATH
      );
      return { ok: true };
    }),

  removeMember: authedQuery
    .input(idInput.extend({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await resolveScope(ctx.user.id, input.organizationId, "admin");
      assertNotBlocked(
        await changeMembership(input.organizationId, input.userId, "remove")
      );
      recordAudit({
        event: "organization.member_removed",
        actorUserId: ctx.user.id,
        subjectUserId: input.userId,
        ip: ctx.clientIp,
        detail: { organizationId: input.organizationId, reason: "removed" },
      });
      const org = await findOrganization(input.organizationId);
      await notify(
        input.userId,
        m => m.organizationRemoved({ organization: org?.name ?? "" }),
        ORGANIZATIONS_PATH
      );
      return { ok: true };
    }),

  /** Selbst austreten. `viewer` genügt – gehen darf jeder. */
  leave: authedQuery.input(idInput).mutation(async ({ ctx, input }) => {
    await resolveScope(ctx.user.id, input.organizationId, "viewer");
    assertNotBlocked(
      await changeMembership(input.organizationId, ctx.user.id, "remove")
    );
    recordAudit({
      event: "organization.member_removed",
      actorUserId: ctx.user.id,
      subjectUserId: ctx.user.id,
      ip: ctx.clientIp,
      detail: { organizationId: input.organizationId, reason: "left" },
    });
    return { ok: true };
  }),
});
