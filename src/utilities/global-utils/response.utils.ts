import { Response } from "express";
import {ErrSeverity, send_slack_message} from "./notify.utils";

export enum status_codes {
    OKAY = 200,
    NEW_USER = 201,
    COMING_SOON = 204,
    EMPTY_RESULT = 301,
    MAX_LOGINS = 401,
    SESSION_EXPIRED_REFRESH_TOKEN = 403,
    UNAUTHORIZED = 409,
    TOO_BIG_PAYLOAD = 413,
    UPDATE_NEEDED = 414,
    INSUFFICIENT_PARAMS = 507,
    DUPLICATE_API = 436,
    NO_PERMISSION = 437,
    REQUEST_DECLINED = 439,
    SERVER_FAULT = 500,
    WARNING = 501,
    ACCEPTED = 502,
    FORBIDDEN = 503,
}

export enum error_messages {
    OKAY = "Okay",
    EMPTY_RESULT = "No Such Records found",
    SERVER_FAULT = "An Error Occurred",
    URL_NOT_FOUND = "Url Not Found",
    SERVER_FAULT_INTERNAL = "An Error Occurred Internally",
    MAX_LOGINS = "Maximum Logins Reached",
    UNAUTHORIZED = "You need to be logged in to perform this action",
    NO_PERMISSION = "Permission denied!",
    NEW_USER = "Welcome!",
    INSUFFICIENT_PARAMS = "Please provide all the Required Values",
    TOO_BIG_PAYLOAD = "Please reduce the Upload Size",
    EMAIL_ID_ABSENT = "Please add the email address before proceeding",
    WARNING = "There are some Warnings",
    THIRD_PARTY_UNAUTHORIZED = "Invalid Authentication",
    INCORRECT_CREDENTIALS = 'Incorrect Credentials'
}

export interface IInternalResponse {
    data?: any;
    statusCode: number;
    message: string;
    send_on_slack?: boolean;
}

export interface IInternalWarning {
    severity?: number;
    warning: string;
    data?: any;
    send_on_slack?: boolean;
}

export interface IInternalWarningFunctions {
    get_warnings: () => IInternalWarning[];
    add_warning: (warning: string, data?: any, send_on_slack?: boolean, severity?: number) => void;
}

export const send_response = (response: Response, data: any = {}, statusCode: status_codes = status_codes.OKAY, message?: string): any => {
    const resp = {
        data: data,
        statuscode: statusCode,
        message: message || error_messages.OKAY,
    };

    response.json(resp);
};

export const send_error_response = (response: Response, message: string = "Internal Error", data: any = {}, statusCode: status_codes = status_codes.SERVER_FAULT, send_on_slack: boolean = false, request?: any): any => {
    const res = {
        data: {},
        statuscode: statusCode,
        message: message,
    };

    // if (statusCode == status_codes.WARNING) {
    res.data = data;
    // }

    if (send_on_slack) {
        send_slack_message(message, ErrSeverity.high, data, request).then();
    }

    response.json(res);
};

export const _extract_zord_error = (zord_error_message) => {
    try {
        return JSON.parse(zord_error_message)[0].message;
    } catch (e) {
        return null;
    }
};

export const make_internal_response = (data: any = {}, message: string = "OKAY"): IInternalResponse => {
    return {
        data: data,
        statusCode: status_codes.OKAY,
        message: message,
    };
};

export const initialize_internal_warnings = (payload: any = {}): IInternalWarningFunctions => {
    let warnings: IInternalWarning[] = [];
    let overwrite_warning = !!payload?.overwrite_warning;

    function add_warning(warning: string, data: any = {}, send_on_slack = true, severity = 0) {
        if (!overwrite_warning) {
            warnings.push({
                warning,
                send_on_slack,
                severity,
                data,
            });
        }
    }

    function get_warnings(): IInternalWarning[] {
        return warnings;
    }

    return {
        add_warning: add_warning,
        get_warnings: get_warnings,
    };
};

export const make_internal_response_with_warnings = (warnings: IInternalWarning[], data: any = {}, message: string = "OKAY"): IInternalResponse => {
    if (warnings.length) {
        return {
            data: {
                warning_message: "Please Confirm",
                warnings: warnings,
            },
            statusCode: status_codes.WARNING,
            message: message,
        };
    }
    return make_internal_response(data, message);
};

export const make_internal_error_response = (message: string = "Internal Error", data: any = {}, send_on_slack: boolean = false, statusCode: status_codes = status_codes.SERVER_FAULT): IInternalResponse => {
    return {
        data: data,
        statusCode: statusCode,
        message: message,
        send_on_slack: send_on_slack,
    };
};

export const send_response_from_internal_response = (response: Response, internal_response: any, request?: any): any => {
    if (internal_response.statusCode == 200) {
        return send_response(response, internal_response.data, internal_response.statusCode, internal_response.message);
    }
    return send_error_response(response, internal_response.message, internal_response.data, internal_response.statusCode, internal_response.send_on_slack, request);
};

export const send_warning_response = (response: Response, warnings: IInternalWarning[], message: string = "OKAY"): IInternalResponse => {
    let data = {
        // warning_message: 'Please Confirm',
        warnings: warnings,
    };
    for (const w of warnings) {
        if (w.send_on_slack) {
            send_slack_message(w.warning, ErrSeverity.medium, w.data).then();
        }
    }

    return send_response(response, data, status_codes.WARNING, message);
};


