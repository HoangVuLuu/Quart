using System.Text;
using Microsoft.EntityFrameworkCore;

namespace Quart.SharedKernel.Persistence;

/// <summary>
/// Decision 0011 wants singular snake_case tables and snake_case columns. A module calls this at the end
/// of <c>OnModelCreating</c> instead of naming every column by hand; names set explicitly are kept.
/// </summary>
public static class SnakeCaseNames
{
    public static void UseSnakeCaseNames(this ModelBuilder modelBuilder)
    {
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            // EF names a table after its DbSet ("Assignments"); a name set by hand is already lower case.
            if (entity.GetTableName() is { } table && table.Any(char.IsUpper))
            {
                entity.SetTableName(ToSnakeCase(entity.ClrType.Name));
            }
            foreach (var property in entity.GetProperties())
            {
                if (property.GetColumnName() == property.Name)
                {
                    property.SetColumnName(ToSnakeCase(property.Name));
                }
            }
            foreach (var key in entity.GetKeys())
            {
                key.SetName(ToSnakeCase(key.GetDefaultName() ?? "pk"));
            }
            foreach (var index in entity.GetIndexes())
            {
                if (index.GetDatabaseName() is { } name && name == index.GetDefaultDatabaseName())
                {
                    index.SetDatabaseName(ToSnakeCase(name));
                }
            }
            foreach (var foreignKey in entity.GetForeignKeys())
            {
                foreignKey.SetConstraintName(ToSnakeCase(foreignKey.GetDefaultName() ?? "fk"));
            }
        }
    }

    /// <summary>"DesiredWeeklyHours" becomes "desired_weekly_hours"; "PK_Thing" becomes "pk_thing".</summary>
    public static string ToSnakeCase(string name)
    {
        var builder = new StringBuilder(name.Length + 8);
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                var previous = i > 0 ? name[i - 1] : '_';
                var next = i + 1 < name.Length ? name[i + 1] : '_';
                if (previous != '_' && (char.IsLower(previous) || char.IsDigit(previous) || (char.IsUpper(previous) && char.IsLower(next))))
                {
                    builder.Append('_');
                }
                builder.Append(char.ToLowerInvariant(c));
            }
            else
            {
                builder.Append(c);
            }
        }
        return builder.ToString();
    }
}
