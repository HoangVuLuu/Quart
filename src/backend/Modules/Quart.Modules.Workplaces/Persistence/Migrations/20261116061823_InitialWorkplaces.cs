using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Workplaces.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialWorkplaces : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "workplaces");

            migrationBuilder.CreateTable(
                name: "membership",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<string>(type: "text", nullable: false),
                    level = table.Column<int>(type: "integer", nullable: false),
                    works_shifts = table.Column<bool>(type: "boolean", nullable: false),
                    desired_weekly_hours = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    max_weekly_hours = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    joined_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false),
                    left_at = table.Column<Instant>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_membership", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "membership_permission",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    permission = table.Column<string>(type: "text", nullable: false),
                    granted_by = table.Column<Guid>(type: "uuid", nullable: false),
                    granted_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_membership_permission", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "owner_invitation",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "text", nullable: false),
                    expires_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false),
                    accepted_at = table.Column<Instant>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_owner_invitation", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "shift_block",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    days = table.Column<int[]>(type: "integer[]", nullable: false),
                    start_time = table.Column<LocalTime>(type: "time", nullable: false),
                    end_time = table.Column<LocalTime>(type: "time", nullable: false),
                    headcount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_shift_block", x => x.id);
                    table.CheckConstraint("ck_shift_block_same_day", "end_time > start_time");
                });

            migrationBuilder.CreateTable(
                name: "workplace",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    address = table.Column<string>(type: "text", nullable: false),
                    time_zone = table.Column<string>(type: "text", nullable: false),
                    join_code = table.Column<string>(type: "text", nullable: false),
                    settings = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_workplace", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "shift_block_conflict",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift_block_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_a = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_b = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_shift_block_conflict", x => x.id);
                    table.CheckConstraint("ck_shift_block_conflict_ordered", "membership_a < membership_b");
                    table.ForeignKey(
                        name: "fk_shift_block_conflict_shift_block_shift_block_id",
                        column: x => x.shift_block_id,
                        principalSchema: "workplaces",
                        principalTable: "shift_block",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "shift_block_requirement",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift_block_id = table.Column<Guid>(type: "uuid", nullable: false),
                    level = table.Column<int>(type: "integer", nullable: false),
                    min_count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_shift_block_requirement", x => x.id);
                    table.ForeignKey(
                        name: "fk_shift_block_requirement_shift_block_shift_block_id",
                        column: x => x.shift_block_id,
                        principalSchema: "workplaces",
                        principalTable: "shift_block",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_membership_user_id",
                schema: "workplaces",
                table: "membership",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ux_membership_active",
                schema: "workplaces",
                table: "membership",
                columns: new[] { "workplace_id", "user_id" },
                unique: true,
                filter: "left_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_membership_permission_membership_id_permission",
                schema: "workplaces",
                table: "membership_permission",
                columns: new[] { "membership_id", "permission" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_owner_invitation_token_hash",
                schema: "workplaces",
                table: "owner_invitation",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_shift_block_workplace_id",
                schema: "workplaces",
                table: "shift_block",
                column: "workplace_id");

            migrationBuilder.CreateIndex(
                name: "ix_shift_block_conflict_shift_block_id_membership_a_membership~",
                schema: "workplaces",
                table: "shift_block_conflict",
                columns: new[] { "shift_block_id", "membership_a", "membership_b" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_shift_block_requirement_shift_block_id",
                schema: "workplaces",
                table: "shift_block_requirement",
                column: "shift_block_id");

            migrationBuilder.CreateIndex(
                name: "ix_workplace_join_code",
                schema: "workplaces",
                table: "workplace",
                column: "join_code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "membership",
                schema: "workplaces");

            migrationBuilder.DropTable(
                name: "membership_permission",
                schema: "workplaces");

            migrationBuilder.DropTable(
                name: "owner_invitation",
                schema: "workplaces");

            migrationBuilder.DropTable(
                name: "shift_block_conflict",
                schema: "workplaces");

            migrationBuilder.DropTable(
                name: "shift_block_requirement",
                schema: "workplaces");

            migrationBuilder.DropTable(
                name: "workplace",
                schema: "workplaces");

            migrationBuilder.DropTable(
                name: "shift_block",
                schema: "workplaces");
        }
    }
}
