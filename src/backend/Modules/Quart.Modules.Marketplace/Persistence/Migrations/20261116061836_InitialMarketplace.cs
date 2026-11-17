using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NodaTime;

#nullable disable

namespace Quart.Modules.Marketplace.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialMarketplace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "marketplace");

            migrationBuilder.CreateTable(
                name: "claim",
                schema: "marketplace",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    give_away_id = table.Column<Guid>(type: "uuid", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    decided_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_claim", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "give_away",
                schema: "marketplace",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    shift_id = table.Column<Guid>(type: "uuid", nullable: false),
                    from_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    taken_by = table.Column<Guid>(type: "uuid", nullable: true),
                    posted_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_give_away", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "trade",
                schema: "marketplace",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workplace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    a_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    a_shift_id = table.Column<Guid>(type: "uuid", nullable: false),
                    b_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    b_shift_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    expires_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<Instant>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_trade", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_claim_shift_id_membership_id",
                schema: "marketplace",
                table: "claim",
                columns: new[] { "shift_id", "membership_id" },
                unique: true,
                filter: "status = 'pending'");

            migrationBuilder.CreateIndex(
                name: "ix_claim_workplace_id_status",
                schema: "marketplace",
                table: "claim",
                columns: new[] { "workplace_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_give_away_shift_id_from_membership_id",
                schema: "marketplace",
                table: "give_away",
                columns: new[] { "shift_id", "from_membership_id" },
                unique: true,
                filter: "status = 'open'");

            migrationBuilder.CreateIndex(
                name: "ix_give_away_workplace_id_status",
                schema: "marketplace",
                table: "give_away",
                columns: new[] { "workplace_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_trade_workplace_id_status",
                schema: "marketplace",
                table: "trade",
                columns: new[] { "workplace_id", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "claim",
                schema: "marketplace");

            migrationBuilder.DropTable(
                name: "give_away",
                schema: "marketplace");

            migrationBuilder.DropTable(
                name: "trade",
                schema: "marketplace");
        }
    }
}
