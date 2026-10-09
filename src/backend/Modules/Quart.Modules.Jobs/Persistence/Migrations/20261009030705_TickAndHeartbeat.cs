using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Jobs.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TickAndHeartbeat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "dedupe_key",
                schema: "jobs",
                table: "scheduled_job",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "heartbeat",
                schema: "jobs",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false),
                    last_tick_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_heartbeat", x => x.id);
                    table.CheckConstraint("ck_heartbeat_single_row", "id = 1");
                });

            migrationBuilder.CreateIndex(
                name: "ux_scheduled_job_dedupe_key",
                schema: "jobs",
                table: "scheduled_job",
                column: "dedupe_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "heartbeat",
                schema: "jobs");

            migrationBuilder.DropIndex(
                name: "ux_scheduled_job_dedupe_key",
                schema: "jobs",
                table: "scheduled_job");

            migrationBuilder.DropColumn(
                name: "dedupe_key",
                schema: "jobs",
                table: "scheduled_job");
        }
    }
}
