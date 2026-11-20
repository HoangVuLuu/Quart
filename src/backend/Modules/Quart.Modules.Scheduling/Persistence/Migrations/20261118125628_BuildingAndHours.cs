using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Scheduling.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BuildingAndHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Instant>(
                name: "draft_saved_at",
                schema: "scheduling",
                table: "period",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "saved_draft",
                schema: "scheduling",
                table: "period",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<Instant>(
                name: "session_seen_at",
                schema: "scheduling",
                table: "period",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "desired_weekly_hours",
                schema: "scheduling",
                table: "availability",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "draft_saved_at",
                schema: "scheduling",
                table: "period");

            migrationBuilder.DropColumn(
                name: "saved_draft",
                schema: "scheduling",
                table: "period");

            migrationBuilder.DropColumn(
                name: "session_seen_at",
                schema: "scheduling",
                table: "period");

            migrationBuilder.DropColumn(
                name: "desired_weekly_hours",
                schema: "scheduling",
                table: "availability");
        }
    }
}
