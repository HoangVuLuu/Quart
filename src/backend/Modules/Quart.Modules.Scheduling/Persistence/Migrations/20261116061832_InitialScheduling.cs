using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Scheduling.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialScheduling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "scheduling");

            migrationBuilder.CreateTable(
                name: "generation_run",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    period_id = table.Column<Guid>(type: "uuid", nullable: false),
                    seed = table.Column<int>(type: "integer", nullable: false),
                    score = table.Column<int>(type: "integer", nullable: false),
                    rules = table.Column<string>(type: "jsonb", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_generation_run", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "period",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    start_date = table.Column<LocalDate>(type: "date", nullable: false),
                    weeks = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    time_zone = table.Column<string>(type: "text", nullable: false),
                    rules = table.Column<string>(type: "jsonb", nullable: false),
                    locked_at = table.Column<Instant>(type: "timestamp with time zone", nullable: true),
                    version = table.Column<int>(type: "integer", nullable: false),
                    published_at = table.Column<Instant>(type: "timestamp with time zone", nullable: true),
                    seed = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_period", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "schedule_version",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    period_id = table.Column<Guid>(type: "uuid", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    published_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false),
                    published_by = table.Column<Guid>(type: "uuid", nullable: false),
                    snapshot = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_schedule_version", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "availability",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    period_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    submitted_at = table.Column<Instant>(type: "timestamp with time zone", nullable: true),
                    reopened_at = table.Column<Instant>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_availability", x => x.id);
                    table.ForeignKey(
                        name: "fk_availability_periods_period_id",
                        column: x => x.period_id,
                        principalSchema: "scheduling",
                        principalTable: "period",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "period_conflict",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    period_id = table.Column<Guid>(type: "uuid", nullable: false),
                    block_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_a = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_b = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_period_conflict", x => x.id);
                    table.ForeignKey(
                        name: "fk_period_conflict_period_period_id",
                        column: x => x.period_id,
                        principalSchema: "scheduling",
                        principalTable: "period",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "shift",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    period_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    date = table.Column<LocalDate>(type: "date", nullable: false),
                    start_time = table.Column<LocalTime>(type: "time", nullable: false),
                    end_time = table.Column<LocalTime>(type: "time", nullable: false),
                    headcount = table.Column<int>(type: "integer", nullable: false),
                    source_block_id = table.Column<Guid>(type: "uuid", nullable: false),
                    starts_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false),
                    ends_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_shift", x => x.id);
                    table.ForeignKey(
                        name: "fk_shift_period_period_id",
                        column: x => x.period_id,
                        principalSchema: "scheduling",
                        principalTable: "period",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "availability_block",
                schema: "scheduling",
                columns: table => new
                {
                    availability_id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_availability_block", x => new { x.availability_id, x.shift_id });
                    table.ForeignKey(
                        name: "fk_availability_block_availability_availability_id",
                        column: x => x.availability_id,
                        principalSchema: "scheduling",
                        principalTable: "availability",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "availability_note",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    availability_id = table.Column<Guid>(type: "uuid", nullable: false),
                    body = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    created_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_availability_note", x => x.id);
                    table.ForeignKey(
                        name: "fk_availability_note_availability_availability_id",
                        column: x => x.availability_id,
                        principalSchema: "scheduling",
                        principalTable: "availability",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "assignment",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    period_id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    is_draft = table.Column<bool>(type: "boolean", nullable: false),
                    is_locked = table.Column<bool>(type: "boolean", nullable: false),
                    source = table.Column<string>(type: "text", nullable: false),
                    starts_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false),
                    ends_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_assignment", x => x.id);
                    table.ForeignKey(
                        name: "fk_assignment_shifts_shift_id",
                        column: x => x.shift_id,
                        principalSchema: "scheduling",
                        principalTable: "shift",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "shift_requirement",
                schema: "scheduling",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift_id = table.Column<Guid>(type: "uuid", nullable: false),
                    level = table.Column<int>(type: "integer", nullable: false),
                    min_count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_shift_requirement", x => x.id);
                    table.ForeignKey(
                        name: "fk_shift_requirement_shift_shift_id",
                        column: x => x.shift_id,
                        principalSchema: "scheduling",
                        principalTable: "shift",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_assignment_period_id_is_draft",
                schema: "scheduling",
                table: "assignment",
                columns: new[] { "period_id", "is_draft" });

            migrationBuilder.CreateIndex(
                name: "ix_assignment_shift_id_membership_id_is_draft",
                schema: "scheduling",
                table: "assignment",
                columns: new[] { "shift_id", "membership_id", "is_draft" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_availability_period_id_membership_id",
                schema: "scheduling",
                table: "availability",
                columns: new[] { "period_id", "membership_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_availability_note_availability_id",
                schema: "scheduling",
                table: "availability_note",
                column: "availability_id");

            migrationBuilder.CreateIndex(
                name: "ix_period_workplace_id_start_date",
                schema: "scheduling",
                table: "period",
                columns: new[] { "workplace_id", "start_date" });

            migrationBuilder.CreateIndex(
                name: "ix_period_conflict_period_id",
                schema: "scheduling",
                table: "period_conflict",
                column: "period_id");

            migrationBuilder.CreateIndex(
                name: "ix_schedule_version_period_id_version",
                schema: "scheduling",
                table: "schedule_version",
                columns: new[] { "period_id", "version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_shift_period_id_date",
                schema: "scheduling",
                table: "shift",
                columns: new[] { "period_id", "date" });

            migrationBuilder.CreateIndex(
                name: "ix_shift_requirement_shift_id",
                schema: "scheduling",
                table: "shift_requirement",
                column: "shift_id");

            // AD-011: one person can never hold two published shifts that overlap in time, in this workplace
            // or any other, even when two requests arrive at the same instant. Ranges are half-open, so a
            // shift ending at 16:00 and one starting at 16:00 do not overlap. Drafts are checked by the
            // evaluator instead. EF Core cannot express an exclusion constraint, hence the SQL.
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS btree_gist;");
            migrationBuilder.Sql(
                """
                ALTER TABLE scheduling.assignment
                ADD CONSTRAINT ex_assignment_no_double_booking
                EXCLUDE USING gist (user_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
                WHERE (NOT is_draft);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "assignment",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "availability_block",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "availability_note",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "generation_run",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "period_conflict",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "schedule_version",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "shift_requirement",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "availability",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "shift",
                schema: "scheduling");

            migrationBuilder.DropTable(
                name: "period",
                schema: "scheduling");
        }
    }
}
