using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Notifications.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class NotificationBundlesAndSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "bundle_id",
                schema: "notifications",
                table: "notification",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Instant>(
                name: "deliver_at",
                schema: "notifications",
                table: "notification",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Instant>(
                name: "delivered_at",
                schema: "notifications",
                table: "notification",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "notification_setting",
                schema: "notifications",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<bool>(type: "boolean", nullable: false),
                    updated_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_notification_setting", x => new { x.user_id, x.workplace_id });
                });

            migrationBuilder.CreateIndex(
                name: "ix_notification_bundle_id",
                schema: "notifications",
                table: "notification",
                column: "bundle_id");

            migrationBuilder.CreateIndex(
                name: "ix_notification_open_bundle",
                schema: "notifications",
                table: "notification",
                columns: new[] { "user_id", "workplace_id", "type" },
                filter: "delivered_at IS NULL AND bundle_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_setting",
                schema: "notifications");

            migrationBuilder.DropIndex(
                name: "ix_notification_bundle_id",
                schema: "notifications",
                table: "notification");

            migrationBuilder.DropIndex(
                name: "ix_notification_open_bundle",
                schema: "notifications",
                table: "notification");

            migrationBuilder.DropColumn(
                name: "bundle_id",
                schema: "notifications",
                table: "notification");

            migrationBuilder.DropColumn(
                name: "deliver_at",
                schema: "notifications",
                table: "notification");

            migrationBuilder.DropColumn(
                name: "delivered_at",
                schema: "notifications",
                table: "notification");
        }
    }
}
