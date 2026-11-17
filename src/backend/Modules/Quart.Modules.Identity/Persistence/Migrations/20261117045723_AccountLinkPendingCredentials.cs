using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Quart.Modules.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AccountLinkPendingCredentials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Session rows now hold the hash of the cookie's key instead of the key. The old rows can no
            // longer be matched, so they go: everyone signs in once more.
            migrationBuilder.Sql("DELETE FROM identity.session;");

            migrationBuilder.AddColumn<string>(
                name: "pending_full_name",
                schema: "identity",
                table: "account_link",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pending_password_hash",
                schema: "identity",
                table: "account_link",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "pending_full_name",
                schema: "identity",
                table: "account_link");

            migrationBuilder.DropColumn(
                name: "pending_password_hash",
                schema: "identity",
                table: "account_link");
        }
    }
}
