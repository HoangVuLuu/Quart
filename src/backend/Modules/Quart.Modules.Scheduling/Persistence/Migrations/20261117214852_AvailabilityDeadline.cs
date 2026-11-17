using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Scheduling.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AvailabilityDeadline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Instant>(
                name: "availability_due_at",
                schema: "scheduling",
                table: "period",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Instant>(
                name: "request_at",
                schema: "scheduling",
                table: "period",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<List<string>>(
                name: "steps_done",
                schema: "scheduling",
                table: "period",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'::text[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "availability_due_at",
                schema: "scheduling",
                table: "period");

            migrationBuilder.DropColumn(
                name: "request_at",
                schema: "scheduling",
                table: "period");

            migrationBuilder.DropColumn(
                name: "steps_done",
                schema: "scheduling",
                table: "period");
        }
    }
}
