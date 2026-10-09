namespace Quart.Generator;

/// <summary>One thing wrong with an input: a stable code and where it is, for example <c>shifts[3].end</c>.</summary>
public sealed record InputError(string Code, string Path);

/// <summary>
/// Checks that an input is internally consistent before any generator sees it: ids are present and
/// unique, every reference points at something that exists, and numbers are in range. It checks the
/// shape of the input, not the quality of a schedule: that is the evaluator's job (AD-002).
/// </summary>
public static class GeneratorInputValidator
{
    public const string Required = "generator.required";
    public const string Duplicate = "generator.duplicate";
    public const string UnknownShift = "generator.unknown_shift";
    public const string UnknownMember = "generator.unknown_member";
    public const string UnknownBlock = "generator.unknown_block";
    public const string OutOfRange = "generator.out_of_range";
    public const string EndNotAfterStart = "generator.end_not_after_start";
    public const string SameMember = "generator.same_member";

    public const int MinLevel = 1;
    public const int MaxLevel = 3;
    public const int MaxConsecutiveShiftsLimit = 4;

    /// <summary>Returns every error found, or an empty list when the input is valid.</summary>
    public static IReadOnlyList<InputError> Validate(GeneratorInput? input)
    {
        var errors = new List<InputError>();
        if (input is null)
        {
            errors.Add(new InputError(Required, ""));
            return errors;
        }

        // A missing list arrives as null from JSON; report it and check the rest as if it were empty.
        var shifts = Present(input.Shifts, "shifts", errors);
        var members = Present(input.Members, "members", errors);
        var availability = Present(input.Availability, "availability", errors);
        var locked = Present(input.LockedAssignments, "lockedAssignments", errors);
        var conflicts = Present(input.ConflictPairs, "conflictPairs", errors);

        var shiftIds = new HashSet<string>(StringComparer.Ordinal);
        var blockIds = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < shifts.Count; i++)
        {
            var path = $"shifts[{i}]";
            var shift = shifts[i];
            if (shift is null)
            {
                errors.Add(new InputError(Required, path));
                continue;
            }

            if (Id(shift.Id, $"{path}.id", errors) && !shiftIds.Add(shift.Id))
            {
                errors.Add(new InputError(Duplicate, $"{path}.id"));
            }
            if (Id(shift.BlockId, $"{path}.blockId", errors))
            {
                blockIds.Add(shift.BlockId);
            }
            if (shift.End <= shift.Start)
            {
                errors.Add(new InputError(EndNotAfterStart, $"{path}.end"));
            }
            if (shift.Headcount < 0)
            {
                errors.Add(new InputError(OutOfRange, $"{path}.headcount"));
            }

            var requirements = Present(shift.LevelRequirements, $"{path}.levelRequirements", errors);
            for (var r = 0; r < requirements.Count; r++)
            {
                var requirementPath = $"{path}.levelRequirements[{r}]";
                var requirement = requirements[r];
                if (requirement is null)
                {
                    errors.Add(new InputError(Required, requirementPath));
                    continue;
                }
                if (requirement.Level is < MinLevel or > MaxLevel)
                {
                    errors.Add(new InputError(OutOfRange, $"{requirementPath}.level"));
                }
                if (requirement.MinCount < 1 || requirement.MinCount > shift.Headcount)
                {
                    errors.Add(new InputError(OutOfRange, $"{requirementPath}.minCount"));
                }
            }
        }

        var memberIds = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < members.Count; i++)
        {
            var path = $"members[{i}]";
            var member = members[i];
            if (member is null)
            {
                errors.Add(new InputError(Required, path));
                continue;
            }

            if (Id(member.Id, $"{path}.id", errors) && !memberIds.Add(member.Id))
            {
                errors.Add(new InputError(Duplicate, $"{path}.id"));
            }
            if (member.Level is < MinLevel or > MaxLevel)
            {
                errors.Add(new InputError(OutOfRange, $"{path}.level"));
            }
            if (member.DesiredWeeklyHours < 0)
            {
                errors.Add(new InputError(OutOfRange, $"{path}.desiredWeeklyHours"));
            }
            if (member.MaxWeeklyHours < 0)
            {
                errors.Add(new InputError(OutOfRange, $"{path}.maxWeeklyHours"));
            }
        }

        var membersWithAvailability = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < availability.Count; i++)
        {
            var path = $"availability[{i}]";
            var entry = availability[i];
            if (entry is null)
            {
                errors.Add(new InputError(Required, path));
                continue;
            }

            if (Member(entry.MemberId, memberIds, $"{path}.memberId", errors) && !membersWithAvailability.Add(entry.MemberId))
            {
                errors.Add(new InputError(Duplicate, $"{path}.memberId"));
            }
            var available = Present(entry.ShiftIds, $"{path}.shiftIds", errors);
            for (var s = 0; s < available.Count; s++)
            {
                Shift(available[s], shiftIds, $"{path}.shiftIds[{s}]", errors);
            }
        }

        var lockedPairs = new HashSet<(string, string)>();
        for (var i = 0; i < locked.Count; i++)
        {
            var path = $"lockedAssignments[{i}]";
            var assignment = locked[i];
            if (assignment is null)
            {
                errors.Add(new InputError(Required, path));
                continue;
            }

            var known = Shift(assignment.ShiftId, shiftIds, $"{path}.shiftId", errors)
                & Member(assignment.MemberId, memberIds, $"{path}.memberId", errors);
            if (known && !lockedPairs.Add((assignment.ShiftId, assignment.MemberId)))
            {
                errors.Add(new InputError(Duplicate, path));
            }
        }

        for (var i = 0; i < conflicts.Count; i++)
        {
            var path = $"conflictPairs[{i}]";
            var pair = conflicts[i];
            if (pair is null)
            {
                errors.Add(new InputError(Required, path));
                continue;
            }

            if (Id(pair.BlockId, $"{path}.blockId", errors) && !blockIds.Contains(pair.BlockId))
            {
                errors.Add(new InputError(UnknownBlock, $"{path}.blockId"));
            }
            var known = Member(pair.MemberA, memberIds, $"{path}.memberA", errors)
                & Member(pair.MemberB, memberIds, $"{path}.memberB", errors);
            if (known && pair.MemberA == pair.MemberB)
            {
                errors.Add(new InputError(SameMember, $"{path}.memberB"));
            }
        }

        if (input.Rules is null)
        {
            errors.Add(new InputError(Required, "rules"));
        }
        else if (input.Rules.MaxConsecutiveShifts is < 1 or > MaxConsecutiveShiftsLimit)
        {
            errors.Add(new InputError(OutOfRange, "rules.maxConsecutiveShifts"));
        }

        return errors;
    }

    /// <summary>Throws when the input is not valid. Generators call it first.</summary>
    /// <exception cref="ArgumentException">The input has at least one error.</exception>
    public static void ThrowIfInvalid(GeneratorInput input)
    {
        var errors = Validate(input);
        if (errors.Count > 0)
        {
            var first = errors[0];
            throw new ArgumentException($"The generator input is not valid: {first.Code} at '{first.Path}' ({errors.Count} error(s)).", nameof(input));
        }
    }

    private static IReadOnlyList<T> Present<T>(IReadOnlyList<T>? list, string path, List<InputError> errors)
    {
        if (list is null)
        {
            errors.Add(new InputError(Required, path));
            return [];
        }
        return list;
    }

    private static bool Id(string? id, string path, List<InputError> errors)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            errors.Add(new InputError(Required, path));
            return false;
        }
        return true;
    }

    private static bool Shift(string? id, HashSet<string> shiftIds, string path, List<InputError> errors)
    {
        if (!Id(id, path, errors))
        {
            return false;
        }
        if (!shiftIds.Contains(id!))
        {
            errors.Add(new InputError(UnknownShift, path));
            return false;
        }
        return true;
    }

    private static bool Member(string? id, HashSet<string> memberIds, string path, List<InputError> errors)
    {
        if (!Id(id, path, errors))
        {
            return false;
        }
        if (!memberIds.Contains(id!))
        {
            errors.Add(new InputError(UnknownMember, path));
            return false;
        }
        return true;
    }
}
