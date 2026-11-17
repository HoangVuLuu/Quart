using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AccountLinkPendingEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "pending_email",
                schema: "identity",
                table: "account_link",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "pending_email",
                schema: "identity",
                table: "account_link");
        }
    }
}
