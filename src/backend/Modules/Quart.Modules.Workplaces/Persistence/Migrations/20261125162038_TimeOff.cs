using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Workplaces.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TimeOff : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "time_off",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    first_day = table.Column<LocalDate>(type: "date", nullable: false),
                    last_day = table.Column<LocalDate>(type: "date", nullable: true),
                    reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    created_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false),
                    decided_at = table.Column<Instant>(type: "timestamp with time zone", nullable: true),
                    decided_by = table.Column<Guid>(type: "uuid", nullable: true),
                    ended_on = table.Column<LocalDate>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_time_off", x => x.id);
                    table.CheckConstraint("ck_time_off_days", "last_day IS NULL OR last_day >= first_day");
                    table.ForeignKey(
                        name: "fk_time_off_membership_membership_id",
                        column: x => x.membership_id,
                        principalSchema: "workplaces",
                        principalTable: "membership",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_time_off_membership_id",
                schema: "workplaces",
                table: "time_off",
                column: "membership_id");

            migrationBuilder.CreateIndex(
                name: "ix_time_off_workplace_id_status",
                schema: "workplaces",
                table: "time_off",
                columns: new[] { "workplace_id", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "time_off",
                schema: "workplaces");
        }
    }
}
