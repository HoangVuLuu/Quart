using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Workplaces.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DayChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "day_change",
                schema: "workplaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    week = table.Column<int>(type: "integer", nullable: false),
                    day = table.Column<int>(type: "integer", nullable: false),
                    kind = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    block_id = table.Column<Guid>(type: "uuid", nullable: true),
                    start_time = table.Column<LocalTime>(type: "time", nullable: true),
                    end_time = table.Column<LocalTime>(type: "time", nullable: true),
                    name = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: true),
                    headcount = table.Column<int>(type: "integer", nullable: false),
                    requirements = table.Column<string>(type: "text", nullable: false),
                    conflicts = table.Column<string>(type: "text", nullable: false),
                    saved_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_day_change", x => x.id);
                    table.CheckConstraint("ck_day_change_day", "day between 1 and 7");
                    table.CheckConstraint("ck_day_change_week", "week between 1 and 4");
                    table.ForeignKey(
                        name: "fk_day_change_shift_blocks_block_id",
                        column: x => x.block_id,
                        principalSchema: "workplaces",
                        principalTable: "shift_block",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_day_change_block_id",
                schema: "workplaces",
                table: "day_change",
                column: "block_id");

            migrationBuilder.CreateIndex(
                name: "ix_day_change_workplace_id",
                schema: "workplaces",
                table: "day_change",
                column: "workplace_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "day_change",
                schema: "workplaces");
        }
    }
}
