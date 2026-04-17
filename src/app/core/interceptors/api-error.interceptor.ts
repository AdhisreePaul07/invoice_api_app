import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';

function isHtmlPayload(payload: unknown): boolean {
  if (typeof payload !== 'string') {
    return false;
  }

  const normalized = payload.trim().toLowerCase();
  return (
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.includes('<head>') ||
    normalized.includes('<body')
  );
}

function fallbackMessage(status: number): string {
  if (status === 0) {
    return 'We could not reach the server. Please check your connection and try again.';
  }

  if (status >= 500) {
    return 'The server ran into a problem while processing your request. Please try again.';
  }

  return 'Something went wrong while processing your request.';
}

@Injectable()
export class ApiErrorInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const isApiReq = req.url.startsWith(environment.apiBaseUrl);
    if (!isApiReq) {
      return next.handle(req);
    }

    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        const contentType = error.headers?.get('content-type')?.toLowerCase() || '';
        const shouldNormalize =
          contentType.includes('text/html') ||
          contentType.includes('text/plain') ||
          isHtmlPayload(error.error);

        if (!shouldNormalize) {
          return throwError(() => error);
        }

        return throwError(
          () =>
            new HttpErrorResponse({
              error: {
                message: fallbackMessage(error.status),
              },
              headers: error.headers,
              status: error.status,
              statusText: error.statusText,
              url: error.url || undefined,
            })
        );
      })
    );
  }
}
